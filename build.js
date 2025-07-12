const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const marked = require('marked');
const { Renderer } = require('marked');
const renderer = new Renderer();

renderer.image = function(href, title, text) {
  return `<div style="text-align: center; margin: 1rem 0;"><img src="${href}" alt="${text}" style="width: 40%; cursor: pointer;" onclick="openImageModal('${href}')"/></div>`;
};
const ejs = require('ejs');
const config = require('./config.json');

// 从配置文件解析路径
const SRC_DIR = path.resolve(process.cwd(), config.sourceDir);
const DIST_DIR = path.resolve(process.cwd(), config.outputDir);
const TEMPLATE_PATH = path.resolve(process.cwd(), config.templatePath);
const IMAGE_DIRS = config.imageDirs;

// 清理并创建输出目录
async function cleanDist() {
  await fs.emptyDir(DIST_DIR);
}

// 获取所有Markdown文件并排序
function getMarkdownFiles() {
  return new Promise((resolve, reject) => {
    glob('**/*.md', { cwd: SRC_DIR, ignore: ['node_modules/**'] }, (err, files) => {
      if (err) return reject(err);
      // 按文件名中的数字前缀排序
      files.sort((a, b) => {
        const numA = a.match(/^\d+/) ? parseInt(a.match(/^\d+/)[0]) : 0;
        const numB = b.match(/^\d+/) ? parseInt(b.match(/^\d+/)[0]) : 0;
        return numA - numB;
      });
      resolve(files);
    });
  });
}

// 生成导航HTML
function generateNav(chapters) {
  // 创建目录结构树
  const tree = { children: {} };
  chapters.forEach(chapter => {
    const parts = chapter.id.split('-');
    let current = tree;
    parts.forEach((part, index) => {
      if (!current.children[part]) {
        current.children[part] = { id: index === parts.length - 1 ? chapter.id : null, title: index === parts.length - 1 ? chapter.title : part.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), children: {} };
      }
      current = current.children[part];
    });
  });

  // 递归生成导航HTML
  function buildNavHtml(node) {
    const children = Object.values(node.children);
    if (children.length === 0) return '';
    return `<ul class="nav">
      ${children.map(child => `
        <li>
          ${child.id ? `<a href="#${child.id}">${child.title}</a>` : `<span class="nav-folder">${child.title}</span>`}
          ${buildNavHtml(child)}
        </li>
      `).join('')}
    </ul>`;
  }

  return buildNavHtml(tree);
}

// 处理Markdown文件并生成HTML
async function processMarkdownFiles(files) {
  // 确保输出目录存在
  await fs.ensureDir(DIST_DIR);
  
  // 收集所有章节内容
  const chapters = [];
  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(SRC_DIR, file), 'utf8');
      const htmlContent = marked.parse(content, { renderer: renderer });
      const relativePath = file.replace(/\\/g, '/'); // 统一路径分隔符为正斜杠
      const id = relativePath.replace(/\.md$/, '').replace(/\//g, '-').toLowerCase();
      const title = path.basename(file, '.md').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      chapters.push({ id, title, content: htmlContent });
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }
  
  // 生成导航HTML
  const navHtml = generateNav(chapters);
  
  // 渲染EJS模板生成单个index.html
  const html = await ejs.renderFile(TEMPLATE_PATH, {
    title: '工业机器人文档',
    nav: navHtml,
    chapters: chapters
  });
  
  const outputPath = path.join(DIST_DIR, 'index.html');
  await fs.writeFile(outputPath, html);
  console.log(`Generated: ${outputPath}`);
}

// 复制图片目录
async function copyImageDirs() {
  for (const dir of IMAGE_DIRS) {
    const src = path.join(SRC_DIR, dir);
    const dest = path.join(DIST_DIR, dir);
    if (await fs.pathExists(src)) {
      await fs.copy(src, dest);
      console.log(`Copied images: ${src} -> ${dest}`);
    }
  }
}

// 主构建函数
async function build() {
  try {
    console.log('Starting build...');
    await cleanDist();
    const files = await getMarkdownFiles();
    if (files.length === 0) {
      console.warn('No Markdown files found');
      return;
    }
    await processMarkdownFiles(files);
    await copyImageDirs();
    console.log('Build completed successfully!');
  } catch (err) {
    console.error('Build failed:', err);
  }
}

// 执行构建
build();