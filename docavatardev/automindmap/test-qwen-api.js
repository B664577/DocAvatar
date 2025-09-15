// 通义千问API连接测试脚本
// 使用方法: node test-qwen-api.js YOUR_API_KEY

const apiKey = process.argv[2];

if (!apiKey) {
    console.log('使用方法: node test-qwen-api.js YOUR_API_KEY');
    process.exit(1);
}

async function testQwenAPI() {
    console.log('🔍 开始测试通义千问API连接...\n');

    // 测试1: OpenAI兼容模式
    console.log('📡 测试1: OpenAI兼容模式');
    try {
        const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'qwen-plus',
                messages: [
                    { role: 'user', content: '你好，请简单介绍一下你自己' }
                ],
                max_tokens: 100
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ OpenAI兼容模式成功!');
            console.log('📝 响应内容:', data.choices[0].message.content);
            console.log('📊 Token使用:', data.usage);
        } else {
            const errorText = await response.text();
            console.log('❌ OpenAI兼容模式失败:', response.status, errorText);
        }
    } catch (error) {
        console.log('❌ OpenAI兼容模式网络错误:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试2: DashScope原生模式
    console.log('📡 测试2: DashScope原生模式');
    try {
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'qwen-plus',
                input: {
                    messages: [
                        { role: 'user', content: '你好，请简单介绍一下你自己' }
                    ]
                },
                parameters: {
                    max_tokens: 100,
                    result_format: 'message'
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ DashScope原生模式成功!');
            if (data.output && data.output.choices && data.output.choices[0]) {
                console.log('📝 响应内容:', data.output.choices[0].message.content);
            }
            if (data.usage) {
                console.log('📊 Token使用:', data.usage);
            }
        } else {
            const errorText = await response.text();
            console.log('❌ DashScope原生模式失败:', response.status, errorText);
        }
    } catch (error) {
        console.log('❌ DashScope原生模式网络错误:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试3: 网络连通性
    console.log('🌐 测试3: 网络连通性检查');
    try {
        const response = await fetch('https://dashscope.aliyuncs.com', { method: 'HEAD' });
        console.log('✅ 阿里云DashScope服务可访问');
    } catch (error) {
        console.log('❌ 无法访问阿里云DashScope服务:', error.message);
    }

    console.log('\n🎯 测试完成!');
    console.log('💡 如果所有测试都失败，请检查:');
    console.log('   1. API密钥是否正确');
    console.log('   2. 阿里云账户是否有余额');
    console.log('   3. 网络连接是否正常');
    console.log('   4. 是否开通了通义千问服务');
}

// 运行测试
testQwenAPI().catch(console.error); 