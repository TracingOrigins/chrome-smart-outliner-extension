// 存储键名
export const ALL_HEADINGS_DOMAINS_KEY = 'all_headings_domains';
export const SPECIAL_PAGES_KEY = 'special_pages';

// 侧边栏可见性存储键名
export const SIDEPANEL_VISIBILITY_KEY = 'sidePanel_visibility';

// 默认特殊页面列表
export const DEFAULT_SPECIAL_PAGES = [
  {
    url: 'chrome://extensions/',
    type: '扩展管理页面',
    message: '扩展管理页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'chrome://',
    type: 'Chrome内部页面',
    message: 'Chrome内部页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'chrome-extension://',
    type: '扩展页面',
    message: '扩展页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'about:',
    type: '浏览器内部页面',
    message: '浏览器内部页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'edge://',
    type: 'Edge设置页面',
    message: '浏览器内部页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'file://',
    type: '本地文件',
    message: '本地文件页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'data:',
    type: '数据页面',
    message: '数据页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'view-source:',
    type: '源代码页面',
    message: '源代码页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'blob:',
    type: 'Blob页面',
    message: 'Blob页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'devtools://',
    type: '开发者工具页面',
    message: '开发者工具页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'https://chrome.google.com/webstore',
    type: 'Chrome商店页面',
    message: 'Chrome商店页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'https://chrome.google.com/extensions',
    type: '扩展管理页面',
    message: '扩展管理页面不支持大纲检测，请访问普通网页'
  },
  {
    url: 'https://chromewebstore.google.com',
    type: 'Chrome商店页面',
    message: 'Chrome商店页面不支持大纲检测，请访问普通网页'
  }
]; 