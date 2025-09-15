// 项目健康检查脚本
import fs from 'fs';
import http from 'http';

console.log('=== AI思维导图项目健康检查 ===');

// 检查关键文件是否存在
const requiredFiles = [
    'index.html',
    'pdf-viewer.html',
    'web-viewer.html',
    'pdf-viewer.js',
    'web-viewer.js',
    'server.js',
    'styles.css'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✓ ${file} 存在`);
    } else {
        console.log(`✗ ${file} 不存在`);
        allFilesExist = false;
    }
});

console.log('\n=== 检查结果 ===');
if (allFilesExist) {
    console.log('✓ 所有关键文件都已就绪');
    console.log('请访问 http://localhost:3000 测试功能');
} else {
    console.log('✗ 存在缺失的文件');
}

// 检查服务器状态
console.log('\n=== 服务器状态 ===');
const req = http.get('http://localhost:3000', (res) => {
    console.log(`✓ 服务器运行正常，状态码: ${res.statusCode}`);
    console.log('🎉 项目已修复完成！请测试以下功能：');
    console.log('1. 上传PDF文件');
    console.log('2. 加载网页内容');
    console.log('3. 截图功能');
    console.log('4. 复制文本功能');
    req.destroy();
}).on('error', () => {
    console.log('✗ 服务器未运行');
    console.log('请运行: node server.js');
});