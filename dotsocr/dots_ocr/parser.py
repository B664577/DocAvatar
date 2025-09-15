import os
import json
from tqdm import tqdm
from multiprocessing.pool import ThreadPool, Pool
import argparse
from pathlib import Path


from dots_ocr.model.inference import inference_with_vllm, inference_with_stepfun
from dots_ocr.utils.consts import image_extensions, MIN_PIXELS, MAX_PIXELS
from dots_ocr.utils.image_utils import get_image_by_fitz_doc, fetch_image, smart_resize
from dots_ocr.utils.doc_utils import fitz_doc_to_image, load_images_from_pdf
from dots_ocr.utils.prompts import dict_promptmode_to_prompt
from dots_ocr.utils.layout_utils import post_process_output, draw_layout_on_image, pre_process_bboxes
from dots_ocr.utils.format_transformer import layoutjson2md


class DotsOCRParser:
    """
    parse image or pdf file
    """
    
    def __init__(self, 
            ip='localhost',
            port=8000,
            model_name='model',
            temperature=0.1,
            top_p=1.0,
            max_completion_tokens=16384,
            num_thread=64,
            dpi = 200, 
            output_dir="./output", 
            min_pixels=None,
            max_pixels=None,
            use_hf=False,
            # Online (StepFun) options
            use_online=False,
            online_vendor=None,
            online_model=None,
            online_api_key=None,
            online_base_url=None,
            online_system_prompt=None,
        ):
        self.dpi = dpi

        # default args for vllm server
        self.ip = ip
        self.port = port
        self.model_name = model_name
        # default args for inference
        self.temperature = temperature
        self.top_p = top_p
        self.max_completion_tokens = max_completion_tokens
        self.num_thread = num_thread
        self.output_dir = output_dir
        self.min_pixels = min_pixels
        self.max_pixels = max_pixels

        self.use_hf = use_hf
        self.use_online = use_online
        self.online_vendor = online_vendor
        self.online_model = online_model
        self.online_api_key = online_api_key
        self.online_base_url = online_base_url
        self.online_system_prompt = online_system_prompt

        if self.use_online:
            print(f"use online provider: {self.online_vendor or 'unknown'} with model {self.online_model}")
        elif self.use_hf:
            self._load_hf_model()
            print(f"use hf model, num_thread will be set to 1")
        else:
            print(f"use vllm model, num_thread will be set to {self.num_thread}")
        assert self.min_pixels is None or self.min_pixels >= MIN_PIXELS
        assert self.max_pixels is None or self.max_pixels <= MAX_PIXELS

    def _resolve_local_weights_dir(self) -> Path:
        """Resolve local weights directory for HF mode with sensible defaults.
        Priority:
        1) DOTS_WEIGHTS_DIR env if provided and exists
        2) Package-local path: <repo>/dotsocr/weights/DotsOCR
        3) CWD path: ./weights/DotsOCR
        """
        env_dir = os.getenv("DOTS_WEIGHTS_DIR")
        if env_dir:
            p = Path(env_dir).expanduser().resolve()
            if p.exists() and p.is_dir():
                return p
        # package-local default
        pkg_dir = Path(__file__).resolve().parent.parent  # dotsocr/
        p = pkg_dir / "weights" / "DotsOCR"
        if p.exists() and p.is_dir():
            return p
        # cwd fallback
        p = Path.cwd() / "weights" / "DotsOCR"
        return p

    def _load_hf_model(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoProcessor
        from qwen_vl_utils import process_vision_info

        model_dir = self._resolve_local_weights_dir()
        if not model_dir.exists():
            raise RuntimeError(
                f"HF weights directory not found at {model_dir}. Please download weights to dotsocr/weights/DotsOCR or set DOTS_WEIGHTS_DIR."
            )
        attn_impl = os.environ.get("DOTS_ATTN_IMPL", "flash_attention_2")
        try:
            self.model = AutoModelForCausalLM.from_pretrained(
                str(model_dir),
                attn_implementation=attn_impl,
                torch_dtype=torch.bfloat16,
                device_map="auto",
                trust_remote_code=True
            )
        except Exception as e:
            # If FlashAttention2 is requested but not installed, fallback to SDPA
            if "flash_attn" in str(e) or "FlashAttention2" in str(e) or "Flash Attention 2" in str(e):
                fallback_impl = "sdpa"
                self.model = AutoModelForCausalLM.from_pretrained(
                    str(model_dir),
                    attn_implementation=fallback_impl,
                    torch_dtype=torch.bfloat16,
                    device_map="auto",
                    trust_remote_code=True
                )
            else:
                raise
        self.processor = AutoProcessor.from_pretrained(str(model_dir), trust_remote_code=True, use_fast=True)
        self.process_vision_info = process_vision_info

    def _inference_with_hf(self, image, prompt, user_hint: str | None = None):
        messages = []
        # 将用户提示词作为系统提示加入，不修改基础提示词内容
        if user_hint:
            hint = str(user_hint).strip()
            if hint:
                messages.append({
                    "role": "system",
                    "content": hint,
                })
        messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "image": image
                    },
                    {"type": "text", "text": prompt}
                ]
            }
        )

        # Preparation for inference
        text = self.processor.apply_chat_template(
            messages, 
            tokenize=False, 
            add_generation_prompt=True
        )
        image_inputs, video_inputs = self.process_vision_info(messages)
        # 兼容不同 transformers 版本：有的 Processor 无 video_processor
        proc_kwargs = dict(
            text=[text],
            images=image_inputs,
            padding=True,
            return_tensors="pt",
        )
        try:
            has_video = hasattr(self.processor, "video_processor") and self.processor.video_processor is not None
        except Exception:
            has_video = False
        if has_video:
            proc_kwargs["videos"] = video_inputs
        inputs = self.processor(**proc_kwargs)

        inputs = inputs.to("cuda")

        # Inference: Generation of the output
        generated_ids = self.model.generate(**inputs, max_new_tokens=24000)
        generated_ids_trimmed = [
            out_ids[len(in_ids) :] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
        ]
        response = self.processor.batch_decode(
            generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
        )[0]
        return response

    def _inference_with_vllm(self, image, prompt, user_hint: str | None = None):
        response = inference_with_vllm(
            image,
            prompt, 
            model_name=self.model_name,
            ip=self.ip,
            port=self.port,
            temperature=self.temperature,
            top_p=self.top_p,
            max_completion_tokens=self.max_completion_tokens,
            user_hint=user_hint,
        )
        return response

    def _inference_with_stepfun(self, image, prompt, user_hint: str | None = None):
        response = inference_with_stepfun(
            image=image,
            prompt=prompt if not self.online_system_prompt else prompt,
            api_key=self.online_api_key,
            base_url=self.online_base_url or "https://api.stepfun.com/v1",
            model_name=self.online_model or "step-1o-turbo-vision",
            temperature=self.temperature,
            top_p=self.top_p,
            user_hint=user_hint,
        )
        return response

    def get_prompt(self, prompt_mode, bbox=None, origin_image=None, image=None, min_pixels=None, max_pixels=None, user_hint: str | None = None):
        prompt = dict_promptmode_to_prompt[prompt_mode]
        if prompt_mode == 'prompt_grounding_ocr':
            assert bbox is not None
            bboxes = [bbox]
            bbox = pre_process_bboxes(origin_image, bboxes, input_width=image.width, input_height=image.height, min_pixels=min_pixels, max_pixels=max_pixels)[0]
            prompt = prompt + str(bbox)
        # 针对 layout_all，明确要求排除页眉/页脚
        if prompt_mode == 'prompt_layout_all_en':
            prompt = f"{prompt}\nPlease exclude elements with categories 'Page-header' and 'Page-footer' from the output."
        # 仅在 prompt_layout_all_en 模式下，将用户提示词追加到基础提示词末尾（不覆盖原提示词）
        if prompt_mode == 'prompt_layout_all_en' and user_hint:
            hint = str(user_hint).strip()
            if hint:
                prompt = f"{prompt}\n{hint}"
        return prompt

    # def post_process_results(self, response, prompt_mode, save_dir, save_name, origin_image, image, min_pixels, max_pixels)
    def _parse_single_image(
        self, 
        origin_image, 
        prompt_mode, 
        save_dir, 
        save_name, 
        source="image", 
        page_idx=0, 
        bbox=None,
        fitz_preprocess=False,
        user_hint: str | None = None,
        ):
        min_pixels, max_pixels = self.min_pixels, self.max_pixels
        if prompt_mode == "prompt_grounding_ocr":
            min_pixels = min_pixels or MIN_PIXELS  # preprocess image to the final input
            max_pixels = max_pixels or MAX_PIXELS
        if min_pixels is not None: assert min_pixels >= MIN_PIXELS, f"min_pixels should >= {MIN_PIXELS}"
        if max_pixels is not None: assert max_pixels <= MAX_PIXELS, f"max_pixels should <+ {MAX_PIXELS}"

        if source == 'image' and fitz_preprocess:
            image = get_image_by_fitz_doc(origin_image, target_dpi=self.dpi)
            image = fetch_image(image, min_pixels=min_pixels, max_pixels=max_pixels)
        else:
            image = fetch_image(origin_image, min_pixels=min_pixels, max_pixels=max_pixels)
        input_height, input_width = smart_resize(image.height, image.width)
        prompt = self.get_prompt(prompt_mode, bbox, origin_image, image, min_pixels=min_pixels, max_pixels=max_pixels, user_hint=user_hint)
        if self.use_hf:
            response = self._inference_with_hf(image, prompt, user_hint=user_hint)
        elif self.use_online:
            response = self._inference_with_stepfun(image, prompt, user_hint=user_hint)
        else:
            response = self._inference_with_vllm(image, prompt, user_hint=user_hint)
        result = {'page_no': page_idx,
            "input_height": input_height,
            "input_width": input_width
        }
        if source == 'pdf':
            save_name = f"{save_name}_page_{page_idx}"
        if prompt_mode in ['prompt_layout_all_en', 'prompt_layout_only_en', 'prompt_grounding_ocr']:
            cells, filtered = post_process_output(
                response, 
                prompt_mode, 
                origin_image, 
                image,
                min_pixels=min_pixels, 
                max_pixels=max_pixels,
                )
            if filtered and prompt_mode != 'prompt_layout_only_en':  # model output json failed, use filtered process
                json_file_path = os.path.join(save_dir, f"{save_name}.json")
                with open(json_file_path, 'w', encoding="utf-8") as w:
                    json.dump(response, w, ensure_ascii=False)

                image_layout_path = os.path.join(save_dir, f"{save_name}.jpg")
                origin_image.save(image_layout_path)
                result.update({
                    'layout_info_path': json_file_path,
                    'layout_image_path': image_layout_path,
                })

                md_file_path = os.path.join(save_dir, f"{save_name}.md")
                with open(md_file_path, "w", encoding="utf-8") as md_file:
                    md_file.write(cells)
                result.update({
                    'md_content_path': md_file_path
                })
                result.update({
                    'filtered': True
                })
            else:
                # 结果后处理：在 layout_all 模式下，过滤掉 Page-header / Page-footer
                if prompt_mode == 'prompt_layout_all_en':
                    try:
                        cells = [c for c in cells if not isinstance(c, dict) or c.get('category') not in ['Page-header', 'Page-footer']]
                    except Exception:
                        pass
                try:
                    image_with_layout = draw_layout_on_image(origin_image, cells)
                except Exception as e:
                    print(f"Error drawing layout on image: {e}")
                    image_with_layout = origin_image

                json_file_path = os.path.join(save_dir, f"{save_name}.json")
                with open(json_file_path, 'w', encoding="utf-8") as w:
                    json.dump(cells, w, ensure_ascii=False)

                image_layout_path = os.path.join(save_dir, f"{save_name}.jpg")
                image_with_layout.save(image_layout_path)
                result.update({
                    'layout_info_path': json_file_path,
                    'layout_image_path': image_layout_path,
                })
                if prompt_mode != "prompt_layout_only_en":  # no text md when detection only
                    md_content = layoutjson2md(origin_image, cells, text_key='text')
                    md_content_no_hf = layoutjson2md(origin_image, cells, text_key='text', no_page_hf=True) # used for clean output or metric of omnidocbench、olmbench 
                    md_file_path = os.path.join(save_dir, f"{save_name}.md")
                    with open(md_file_path, "w", encoding="utf-8") as md_file:
                        md_file.write(md_content)
                    md_nohf_file_path = os.path.join(save_dir, f"{save_name}_nohf.md")
                    with open(md_nohf_file_path, "w", encoding="utf-8") as md_file:
                        md_file.write(md_content_no_hf)
                    result.update({
                        'md_content_path': md_file_path,
                        'md_content_nohf_path': md_nohf_file_path,
                    })
        else:
            image_layout_path = os.path.join(save_dir, f"{save_name}.jpg")
            origin_image.save(image_layout_path)
            result.update({
                'layout_image_path': image_layout_path,
            })

            md_content = response
            md_file_path = os.path.join(save_dir, f"{save_name}.md")
            with open(md_file_path, "w", encoding="utf-8") as md_file:
                md_file.write(md_content)
            result.update({
                'md_content_path': md_file_path,
            })

        return result
    
    def parse_image(self, input_path, filename, prompt_mode, save_dir, bbox=None, fitz_preprocess=False, user_hint: str | None = None):
        origin_image = fetch_image(input_path)
        result = self._parse_single_image(origin_image, prompt_mode, save_dir, filename, source="image", bbox=bbox, fitz_preprocess=fitz_preprocess, user_hint=user_hint)
        result['file_path'] = input_path
        return [result]
        
    def parse_pdf(self, input_path, filename, prompt_mode, save_dir, user_hint: str | None = None):
        print(f"loading pdf: {input_path}")
        images_origin = load_images_from_pdf(input_path, dpi=self.dpi)
        total_pages = len(images_origin)
        tasks = [
            {
                "origin_image": image,
                "prompt_mode": prompt_mode,
                "save_dir": save_dir,
                "save_name": filename,
                "source":"pdf",
                "page_idx": i,
                "user_hint": user_hint,
            } for i, image in enumerate(images_origin)
        ]

        def _execute_task(task_args):
            return self._parse_single_image(**task_args)

        if self.use_hf:
            num_thread =  1
        else:
            num_thread = min(total_pages, self.num_thread)
        print(f"Parsing PDF with {total_pages} pages using {num_thread} threads...")

        results = []
        with ThreadPool(num_thread) as pool:
            with tqdm(total=total_pages, desc="Processing PDF pages") as pbar:
                for result in pool.imap_unordered(_execute_task, tasks):
                    results.append(result)
                    pbar.update(1)

        results.sort(key=lambda x: x["page_no"])
        for i in range(len(results)):
            results[i]['file_path'] = input_path
        return results

    def parse_file(self, 
        input_path, 
        output_dir="", 
        prompt_mode="prompt_layout_all_en",
        bbox=None,
        fitz_preprocess=False,
        user_hint: str | None = None,
        ):
        output_dir = output_dir or self.output_dir
        output_dir = os.path.abspath(output_dir)
        filename, file_ext = os.path.splitext(os.path.basename(input_path))
        save_dir = os.path.join(output_dir, filename)
        os.makedirs(save_dir, exist_ok=True)

        if file_ext == '.pdf':
            results = self.parse_pdf(input_path, filename, prompt_mode, save_dir, user_hint=user_hint)
        elif file_ext in image_extensions:
            results = self.parse_image(input_path, filename, prompt_mode, save_dir, bbox=bbox, fitz_preprocess=fitz_preprocess, user_hint=user_hint)
        else:
            raise ValueError(f"file extension {file_ext} not supported, supported extensions are {image_extensions} and pdf")
        
        print(f"Parsing finished, results saving to {save_dir}")
        with open(os.path.join(output_dir, os.path.basename(filename)+'.jsonl'), 'w', encoding="utf-8") as w:
            for result in results:
                w.write(json.dumps(result, ensure_ascii=False) + '\n')

        return results



def main():
    prompts = list(dict_promptmode_to_prompt.keys())
    parser = argparse.ArgumentParser(
        description="dots.ocr Multilingual Document Layout Parser",
    )
    
    parser.add_argument(
        "input_path", type=str,
        help="Input PDF/image file path"
    )
    
    parser.add_argument(
        "--output", type=str, default="./output",
        help="Output directory (default: ./output)"
    )
    
    parser.add_argument(
        "--prompt", choices=prompts, type=str, default="prompt_layout_all_en",
        help="prompt to query the model, different prompts for different tasks"
    )
    parser.add_argument(
        '--bbox', 
        type=int, 
        nargs=4, 
        metavar=('x1', 'y1', 'x2', 'y2'),
        help='should give this argument if you want to prompt_grounding_ocr'
    )
    parser.add_argument(
        "--ip", type=str, default="localhost",
        help=""
    )
    parser.add_argument(
        "--port", type=int, default=8000,
        help=""
    )
    parser.add_argument(
        "--model_name", type=str, default="model",
        help=""
    )
    parser.add_argument(
        "--temperature", type=float, default=0.1,
        help=""
    )
    parser.add_argument(
        "--top_p", type=float, default=1.0,
        help=""
    )
    parser.add_argument(
        "--dpi", type=int, default=200,
        help=""
    )
    parser.add_argument(
        "--max_completion_tokens", type=int, default=16384,
        help=""
    )
    parser.add_argument(
        "--num_thread", type=int, default=16,
        help=""
    )
    parser.add_argument(
        "--no_fitz_preprocess", action='store_true',
        help="False will use tikz dpi upsample pipeline, good for images which has been render with low dpi, but maybe result in higher computational costs"
    )
    parser.add_argument(
        "--min_pixels", type=int, default=None,
        help=""
    )
    parser.add_argument(
        "--max_pixels", type=int, default=None,
        help=""
    )
    parser.add_argument(
        "--use_hf", type=bool, default=False,
        help="use to choose the inference method: vllm-server or transformers"
    )

    args = parser.parse_args()

    use_hf = args.use_hf
    dpi = args.dpi
    min_pixels = args.min_pixels
    max_pixels = args.max_pixels
    output_dir = args.output

    dots_ocr_parser = DotsOCRParser(
        ip=args.ip,
        port=args.port,
        model_name=args.model_name,
        temperature=args.temperature,
        top_p=args.top_p,
        max_completion_tokens=args.max_completion_tokens,
        num_thread=args.num_thread,
        dpi=dpi,
        output_dir=output_dir, 
        min_pixels=min_pixels,
        max_pixels=max_pixels,
        use_hf=use_hf,
    )

    filepath = args.input_path

    if args.no_fitz_preprocess:
        fitz_preprocess = False
    else:
        fitz_preprocess = True

    # result = dots_ocr_parser.get_prompt(prompt_mode=args.prompt, image=image_input)
    results = dots_ocr_parser.parse_file(
        filepath, 
        output_dir=output_dir, 
        prompt_mode=args.prompt,
        fitz_preprocess=fitz_preprocess
        )

    print(results)


if __name__ == "__main__":
    main()
