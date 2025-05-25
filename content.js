/*
 * 大纲提取脚本
 * 
 * 核心功能：
 * 1. 智能提取页面主要内容和标题结构
 * 2. 监测用户滚动和页面变化，更新活动标题
 * 3. 支持特殊网站（Inoreader和Feedly）的定制优化
 * 
 * 优化说明：
 * - 使用元素权重和深度分析来确定文章主体区域
 * - 通过DOM结构分析而非简单选择器匹配来识别标题层级
 * - 适配特殊网站的定制逻辑
 */

// 存储键名
const ALL_HEADINGS_DOMAINS_KEY = 'all_headings_domains';
const CUSTOM_SELECTORS_KEY = 'custom_selectors';
const SPECIAL_PAGES_KEY = 'special_pages';
const SIDEPANEL_VISIBILITY_KEY = 'sidePanel_visibility';

// 默认特殊页面列表
const DEFAULT_SPECIAL_PAGES = [
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
  }
];

// 检查扩展是否有效
function isExtensionValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (error) {
    return false;
  }
}

// 添加高亮样式
const style = document.createElement('style');
style.textContent = `
  .outline-highlight {
    background-color: rgba(255, 255, 0, 0.3);
    animation: fadeOut 3s forwards;
  }

  @keyframes fadeOut {
    from {
      background-color: rgba(255, 255, 0, 0.3);
    }
    to {
      background-color: transparent;
    }
  }
`;
document.head.appendChild(style);

// 高亮选中的标题
function highlightHeading(headingId) {
  // 移除之前的高亮
  const previousHighlight = document.querySelector('.outline-highlight');
  if (previousHighlight) {
    previousHighlight.classList.remove('outline-highlight');
  }
  
  // 添加新的高亮
  const heading = document.getElementById(headingId);
  if (heading) {
    heading.classList.add('outline-highlight');
    
    // 记录当前活动标题ID
    if (lastActiveHeadingId !== headingId) {
      lastActiveHeadingId = headingId;
      
      // 向background发送活动标题消息
      sendActiveHeadingMessage(headingId).catch(() => {
        // 忽略发送错误
      });
    }
  }
}

// 使用Intersection Observer更精确地监测标题可见性
let lastActiveHeadingId = null;
let intersectionObserver = null;
let scrollTimeout = null;
let lastScrollTop = 0; // 记录上次滚动位置
let isManualScrolling = false; // 标记是否为手动滚动（点击导致的）

// 检测当前视口顶部的标题
async function detectVisibleHeading() {
  if (!isExtensionValid()) return;
  
  // 如果已经阻止检测或正在手动滚动，则直接返回
  if (preventScrollDetection || isManualScrolling) return;
  
  // 确保配置已加载
  await ensureConfigLoaded();
  
  try {
    // 使用优化后的大纲提取逻辑获取所有标题
    const outline = await getPageOutline();
    if (!outline || outline.length === 0) return;
    
    // 只检测在大纲中的标题元素
    const headingIds = outline.map(item => item.id);
    const headings = headingIds
      .map(id => document.getElementById(id))
      .filter(h => h !== null);
    
    if (headings.length === 0) return;
    
    // 获取当前滚动位置
    const currentScrollTop = window.scrollY || document.documentElement.scrollTop;
    const isScrollingDown = currentScrollTop > lastScrollTop;
    lastScrollTop = currentScrollTop;
    
    // 定义视口边界
    const viewportTop = 0;
    const viewportHeight = window.innerHeight;
    const viewportCenter = viewportHeight / 2;
    
    // 记录最佳匹配的标题
    let bestHeading = null;
    let bestScore = -Infinity;
    
    // 性能优化：使用requestAnimationFrame确保在下一帧计算位置
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        // 给每个标题打分，综合考虑位置和大小
        for (const heading of headings) {
          const rect = heading.getBoundingClientRect();
          
          // 1. 完全可见的标题优先
          const isCompletelyVisible = 
            rect.top >= viewportTop && 
            rect.bottom <= viewportHeight;
            
          // 2. 在视口顶部附近的标题优先（适合阅读时）
          const distanceFromIdealTop = Math.abs(rect.top - 80); // 理想位置：距顶部80px
          
          // 3. 在视口中心附近的标题也考虑（适合浏览时）
          const distanceFromCenter = Math.abs(rect.top + rect.height/2 - viewportCenter);
          
          // 根据滚动方向调整评分策略
          let score;
          if (isScrollingDown) {
            // 向下滚动时，优先考虑刚进入视口上方的标题
            score = 
              (isCompletelyVisible ? 1000 : 0) + 
              (rect.top > 0 ? 500 : 0) - 
              distanceFromIdealTop;
          } else {
            // 向上滚动时，优先考虑接近视口顶部的标题  
            score = 
              (isCompletelyVisible ? 1000 : 0) + 
              (rect.top < viewportHeight/3 ? 800 : 0) -
              distanceFromIdealTop;
          }
          
          // 额外考虑标题级别
          const headingLevel = parseInt(heading.tagName[1]);
          score += (7 - headingLevel) * 50; // 较高级别的标题获得额外分数
          
          // 记录得分最高的标题
          if (score > bestScore) {
            bestScore = score;
            bestHeading = {
              element: heading,
              id: heading.id
            };
          }
        }
        resolve();
      });
    });
    
    // 如果找到最匹配的标题，发送活动标题消息
    if (bestHeading) {
      // 发送活动标题消息
      await sendActiveHeadingMessage(bestHeading.id);
    }
  } catch (error) {
    // console.error('检测可见标题时出错:', error);
  }
}

// 初始化Intersection Observer
async function setupIntersectionObserver() {
  // 确保配置已加载
  await ensureConfigLoaded();
  
  // 如果已经初始化，先清理
  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }
  
  // 创建配置项，使用多个阈值以获得更精确的交叉信息
  const options = {
    root: null, // 使用视口作为根
    rootMargin: '0px 0px -80% 0px', // 主要关注视口顶部区域
    threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
  };
  
  // 创建观察器
  intersectionObserver = new IntersectionObserver(async (entries) => {
    // 如果禁用了检测或正在手动滚动，直接返回
    if (preventScrollDetection || isManualScrolling) return;
    
    // 过滤出进入视野的条目
    const enteringEntries = entries.filter(entry => 
      entry.isIntersecting && 
      entry.intersectionRatio > 0.1 &&
      entry.boundingClientRect.top > 0
    );
    
    if (enteringEntries.length > 0) {
      // 按照顶部位置排序
      enteringEntries.sort((a, b) => 
        a.boundingClientRect.top - b.boundingClientRect.top
      );
      
      // 获取当前滚动方向
        const currentScrollTop = window.scrollY || document.documentElement.scrollTop;
        const isScrollingDown = currentScrollTop > lastScrollTop;
        lastScrollTop = currentScrollTop;
        
      // 选择最合适的标题
      let targetEntry;
          if (isScrollingDown) {
        // 向下滚动时，选择第一个进入视野的标题
        targetEntry = enteringEntries[0];
          } else {
        // 向上滚动时，选择最后一个标题
        targetEntry = enteringEntries[enteringEntries.length - 1];
      }
      
      if (targetEntry) {
        await sendActiveHeadingMessage(targetEntry.target.id);
      }
    }
  }, options);
  
  try {
    // 获取当前大纲中的标题
    const outline = await getPageOutline();
    const headingIds = outline.map(item => item.id);
    
    // 只观察大纲中的标题
    headingIds.forEach(id => {
      const heading = document.getElementById(id);
      if (heading) {
        intersectionObserver.observe(heading);
      }
    });
  } catch (error) {
    // console.error('设置Intersection Observer时出错:', error);
  }
}

// 发送活动标题消息
async function sendActiveHeadingMessage(headingId) {
  // 避免重复发送相同的标题
  if (lastActiveHeadingId === headingId) return;
  
  lastActiveHeadingId = headingId;
  
  try {
    await sendMessagePromise({
      action: 'activeHeading',
      headingId: headingId
    });
  } catch (error) {
    // 忽略所有错误
  }
}

// 改进的滚动处理函数
function handleScroll() {
  // 如果已经阻止检测，则直接返回
  if (preventScrollDetection) {
    return;
  }
  
  // 如果存在前一个定时器，则清除
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  
  // 设置新定时器，采用两阶段检测策略
  // 1. 快速初步检测
  scrollTimeout = setTimeout(async () => {
    try {
      await detectVisibleHeading();
      
      // 2. 滚动结束后的精细检测（确保找到正确的位置）
      scrollTimeout = setTimeout(async () => {
        try {
          await detectVisibleHeading();
        } catch (error) {
          // 忽略错误
        }
      }, 200);
    } catch (error) {
      // 忽略错误
    }
  }, 50);
}

// 文章标签权重配置
const ARTICLE_TAG_WEIGHTS = {
  h1: [0, 100, 60, 40, 30, 25, 22, 18].map(s => s * 0.4),
  h2: [0, 100, 60, 40, 30, 25, 22, 18],
  h3: [0, 100, 60, 40, 30, 25, 22, 18].map(s => s * 0.5),
  h4: [0, 100, 60, 40, 30, 25, 22, 18].map(s => s * 0.5 * 0.5),
  h5: [0, 100, 60, 40, 30, 25, 22, 18].map(s => s * 0.5 * 0.5 * 0.5),
  h6: [0, 100, 60, 40, 30, 25, 22, 18].map(s => s * 0.5 * 0.5 * 0.5 * 0.5),
  strong: [0, 100, 60, 40, 30, 25, 22, 18].map(s => s * 0.5 * 0.5 * 0.5),
  article: [500],
  '.article': [500],
  '#article': [500],
  '.content': [101],
  sidebar: [-500, -100, -50],
  '.sidebar': [-500, -100, -50],
  '#sidebar': [-500, -100, -50],
  aside: [-500, -100, -50],
  '.aside': [-500, -100, -50],
  '#aside': [-500, -100, -50],
  nav: [-500, -100, -50],
  '.nav': [-500, -100, -50],
  '.navigation': [-500, -100, -50],
  '.toc': [-500, -100, -50],
  '.table-of-contents': [-500, -100, -50],
  '.comment': [-500, -100, -50],
};

// 标题标签权重
const HEADING_TAG_WEIGHTS = {
  H1: 4,
  H2: 9,
  H3: 9,
  H4: 10,
  H5: 10,
  H6: 10,
  STRONG: 5,
};

// 获取元素的所有祖先元素
function getAncestors(elem, maxDepth = -1) {
  const ancestors = [];
  let cur = elem;
  while (cur && maxDepth--) {
    ancestors.push(cur);
    cur = cur.parentElement;
  }
  return ancestors;
}

// 获取元素的共同左边缘位置
function getElemsCommonLeft(elems) {
  if (!elems.length) {
    return undefined;
  }
  const lefts = {};
  elems.forEach(el => {
    const left = el.getBoundingClientRect().left;
    if (!lefts[left]) {
      lefts[left] = 0;
    }
    lefts[left]++;
  });
  const count = elems.length;

  const isAligned = Object.keys(lefts).length <= Math.ceil(0.3 * count);
  if (!isAligned) {
    return undefined;
  }
  const sortedByCount = Object.keys(lefts).sort((a, b) => lefts[b] - lefts[a]);
  const most = Number(sortedByCount[0]);
  return most;
}

// 将NodeList或HTMLCollection转为数组
function toArray(collection) {
  return Array.prototype.slice.call(collection);
}

// 配置变量
let shouldDetectAllHeadings = false;
let preventScrollDetection = false;

// 默认特殊网站选择器
const DEFAULT_SELECTORS = {
  inoreader: '.article_content',
  feedly: '.entryBody'
};

// 存储自定义选择器的变量
let customSelectors = {...DEFAULT_SELECTORS};

// 加载配置
async function loadConfig() {
  const result = await chrome.storage.sync.get({
    [ALL_HEADINGS_DOMAINS_KEY]: [],
    [CUSTOM_SELECTORS_KEY]: DEFAULT_SELECTORS
  });
  
  const allHeadingsDomains = result[ALL_HEADINGS_DOMAINS_KEY] || [];
  customSelectors = result[CUSTOM_SELECTORS_KEY] || DEFAULT_SELECTORS;
  
  // 检查当前域名是否在列表中
  const currentHost = window.location.hostname;
  shouldDetectAllHeadings = allHeadingsDomains.some(domain => 
    currentHost === domain || currentHost.endsWith('.' + domain));
    
  // console.log('配置加载完成，全网页检测:', shouldDetectAllHeadings);
  // console.log('自定义选择器:', customSelectors);
}

// 智能提取文章区域
function extractArticle() {
  const elemScores = new Map();

  // 根据选择器和距离权重评分
  Object.keys(ARTICLE_TAG_WEIGHTS).forEach(selector => {
    let elems = toArray(document.querySelectorAll(selector));
    if (selector.toLowerCase() === 'strong') {
      // 对于<strong>元素，只有当它们左对齐时才将其视为标题
      const commonLeft = getElemsCommonLeft(elems);
      if (commonLeft === undefined || commonLeft > window.innerWidth / 2) {
        elems = [];
      } else {
        elems = elems.filter(
          elem => elem.getBoundingClientRect().left === commonLeft
        );
      }
    }
    elems.forEach(elem => {
      const weights = ARTICLE_TAG_WEIGHTS[selector];
      const ancestors = getAncestors(elem, weights.length);
      ancestors.forEach((elem, distance) => {
        elemScores.set(
          elem,
          (elemScores.get(elem) || 0) + (weights[distance] || 0)
        );
      });
    });
  });
  const sortedByScore = [...elemScores].sort((a, b) => b[1] - a[1]);

  // 选择前5个节点重新评分
  const candidates = sortedByScore
    .slice(0, 5)
    .filter(Boolean)
    .map(([elem, score]) => {
      return { elem, score };
    });

  // 根据"占据更多垂直空间"、"包含更少链接"、"不太窄"、"不能滚动"等因素重新评分
  const isTooNarrow = e => e.scrollWidth < 400; // 排除侧边栏
  candidates.forEach(candidate => {
    if (isTooNarrow(candidate.elem)) {
      candidate.score = 0;
      candidates.forEach(parent => {
        if (parent.elem.contains(candidate.elem)) {
          parent.score *= 0.7;
        }
      });
    }
    if (canScroll(candidate.elem) && candidate.elem !== document.body) {
      candidate.score *= 0.5;
    }
  });

  const reweighted = candidates
    .map(({ elem, score }) => {
      return {
        elem,
        score:
          score *
          Math.log(
            (elem.scrollHeight * elem.scrollHeight) /
              (elem.querySelectorAll('a').length || 1)
          )
      };
    })
    .sort((a, b) => b.score - a.score);

  let article = reweighted.length ? reweighted[0].elem : undefined;

  // 特殊网站处理
  const dm = document.domain;
  const isInoReader = dm.indexOf('inoreader.com') >= 0 || dm.indexOf('innoreader.com') > 0;
  const isFeedly = dm.indexOf('feedly.com') >= 0;

  // 使用已加载的自定义选择器
  let selectorInoreader = customSelectors.inoreader || DEFAULT_SELECTORS.inoreader;
  let selectorFeedly = customSelectors.feedly || DEFAULT_SELECTORS.feedly;

  if (isInoReader || isFeedly) {
    const articleClass = isFeedly ? selectorFeedly : selectorInoreader;
    const content = document.querySelector(articleClass);
    if (content != null) {
      article = content;
    } else {
      article = undefined;
    }
  }

  return article;
}

// 检查元素是否可滚动
function canScroll(element) {
  const style = window.getComputedStyle(element);
  return ['scroll', 'auto'].includes(style.overflowY) ||
         ['scroll', 'auto'].includes(style.overflow);
}

// 智能提取标题
function extractHeadings(articleDom) {
  const isVisible = elem => elem.offsetHeight !== 0;
  
  // 定义标题组类型
  const headingTagGroups = Object.keys(HEADING_TAG_WEIGHTS)
    .map(tag => {
      let elems = toArray(articleDom.getElementsByTagName(tag));
      if (tag.toLowerCase() === 'strong') {
        // 对于<strong>元素，只有当它们左对齐时才将其视为标题
        const commonLeft = getElemsCommonLeft(elems);
        if (commonLeft === undefined || commonLeft > articleDom.getBoundingClientRect().left + 100) {
          elems = [];
        } else {
          elems = elems.filter(
            elem => elem.getBoundingClientRect().left === commonLeft
          );
        }
      }
      return {
        tag,
        elems,
        score: elems.length * HEADING_TAG_WEIGHTS[tag]
      };
    })
    .filter(group => group.score >= 10 && group.elems.length > 0)
    .filter(group => {
      return group.elems.filter(isVisible).length >= group.elems.length * 0.5;
    })
    .slice(0, 3);

  // 使用文档顺序
  const headingTags = headingTagGroups.map(headings => headings.tag);
  const acceptNode = node => {
    const group = headingTagGroups.find(g => g.tag === node.tagName);
    if (!group) {
      return NodeFilter.FILTER_SKIP;
    }
    return group.elems.includes(node) && isVisible(node)
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_SKIP;
  };
  
  const treeWalker = document.createTreeWalker(
    articleDom,
    NodeFilter.SHOW_ELEMENT,
    { acceptNode }
  );
  
  const headings = [];
  let id = 0;
  
  while (treeWalker.nextNode()) {
    const dom = treeWalker.currentNode;
    const anchor =
      dom.id ||
      toArray(dom.querySelectorAll('a'))
        .map(a => {
          let href = a.getAttribute('href') || '';
          return href.startsWith('#') ? href.substr(1) : a.id;
        })
        .filter(Boolean)[0];
        
    // 如果元素没有ID，生成一个
    if (!dom.id) {
      dom.id = 'heading-' + Math.random().toString(36).substr(2, 9);
    }
    
    headings.push({
      dom,
      text: dom.textContent || '',
      level: headingTags.indexOf(dom.tagName) + 1,
      id: dom.id,
      anchor
    });
    id++;
  }
  
  return headings;
}

// 获取页面大纲结构
async function getPageOutline() {
  // 确保配置已加载
  await ensureConfigLoaded();
  
  try {
    // 在配置列表中的网站使用全网页标题检测
    if (shouldDetectAllHeadings) {
      // 直接获取所有标题元素
      const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const outline = processHeadings(Array.from(allHeadings));
      // console.log('使用全网页检测，找到标题数量:', outline.length);
      return outline;
    } else {
      // 使用智能提取算法
      const article = extractArticle();
      if (!article) {
        // 如果无法找到文章元素，回退到简单搜索
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        const outline = processHeadings(headings);
        // console.log('未找到文章区域，使用简单搜索，找到标题数量:', outline.length);
        return outline;
      }
      
      const headings = extractHeadings(article);
      const outline = headings.map(heading => ({
        id: heading.id,
        text: heading.text.trim(),
        level: heading.level
      })).filter(item => item.text);
      
      // console.log('使用智能提取，找到标题数量:', outline.length);
      return outline;
    }
  } catch (error) {
    // console.error('提取大纲失败:', error);
    // 出错时回退到简单搜索
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const outline = processHeadings(headings);
    // console.log('提取失败，使用简单搜索，找到标题数量:', outline.length);
    return outline;
  }
}

// 处理标题元素列表，生成大纲数据结构
function processHeadings(headings) {
  const outline = [];
  
  headings.forEach(heading => {
    // 如果标题没有ID，为其生成一个唯一的ID
    if (!heading.id) {
      heading.id = 'heading-' + Math.random().toString(36).substr(2, 9);
    }
    
    // 过滤掉空标题或只包含空白字符的标题
    const text = heading.textContent.trim();
    if (text) {
      outline.push({
        level: parseInt(heading.tagName[1]),
        text: text,
        id: heading.id
      });
    }
  });
  
  return outline;
}

// 获取元素的唯一选择器 (用于智能识别)
function getElementSelector(element) {
  if (!element || element === document.body) return 'body';
  
  // 使用ID
  if (element.id) return '#' + element.id;
  
  // 使用类名
  if (element.className) {
    const classes = element.className.split(' ')
      .filter(c => c && !c.match(/^(container|wrapper|inner|content)$/i));
    if (classes.length) return '.' + classes[0];
  }
  
  // 使用标签名
  return element.tagName.toLowerCase();
}

/*
 * ========================================================
 * 以下为内容观察和交互处理的代码
 * ========================================================
 */

// 定义一个专门用于 MutationObserver 回调的异步包装函数
function createMutationCallback(fn) {
  return debounce(async function(...args) {
    try {
      await fn(...args);
    } catch (error) {
      // 处理DOM变化时出错
    }
  }, 200);
}

// 初始化所有观察器
async function setupObservers() {
  // 设置标题可见性观察器
  await setupIntersectionObserver();
  
  // 观察内容变化，用于检测可见标题
  const contentObserver = new MutationObserver(
    createMutationCallback(async () => {
      if (!isExtensionValid() || preventScrollDetection) return;
      await detectVisibleHeading();
    })
  );
  
  // 观察DOM变化以更新大纲
  const outlineObserver = new MutationObserver(
    createMutationCallback(async () => {
      if (!isExtensionValid()) {
        outlineObserver.disconnect();
        return;
      }

      // 确保配置已加载
      await ensureConfigLoaded();
      
      try {
        // 获取新的大纲结构
        const outline = await getPageOutline();
        
        // 只有当大纲有变化时才发送更新
        const currentOutlineJson = JSON.stringify(outline);
        if (currentOutlineJson !== lastOutlineJson) {
          lastOutlineJson = currentOutlineJson;
          
          // 通知background script更新大纲
          try {
            await sendMessageWithRetry({
              action: 'updateOutline',
              outline: outline,
            });
          } catch (error) {
            if (error.message && error.message.includes('Extension context invalidated')) {
              outlineObserver.disconnect();
              return;
            } else {
              throw error;
            }
          }
          
          // 更新标题监听
          await setupIntersectionObserver();
        }
      } catch (error) {
        // 更新大纲时出错
      }
    })
  );
  
  // 尝试启动所有观察器
  try {
    // 使用性能更好的配置，减少不必要的触发
    contentObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false, // 只在DOM结构变化时触发
      characterData: false
    });
    
    outlineObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
    
    // 监听滚动事件，使用被动监听提高性能
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // 保存观察器引用，以便后续可以断开连接
    return { contentObserver, outlineObserver };
  } catch (error) {
    // 初始化观察器失败
    return null;
  }
}

// 存储上一次的大纲JSON字符串和观察器
let lastOutlineJson = '';
let observers = null;

// 标志变量，指示配置是否已加载
let configLoaded = false;

// 发送消息的包装函数，带有重试机制
async function sendMessageWithRetry(message, maxRetries = 3) {
  let retryCount = 0;
  while (retryCount < maxRetries) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      retryCount++;
      if (error.message && error.message.includes('Extension context invalidated')) {
        throw error; // 扩展已失效，不再重试
      }
      if (retryCount === maxRetries) {
        throw error; // 达到最大重试次数
      }
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }
}

// 配置加载后的初始化
async function initializeAfterConfigLoaded() {

  if (!isExtensionValid()) {
    return;
  }

  try {
    // console.log('开始初始化内容...');
    
    // 首先检查是否是特殊页面
    const url = window.location.href;
    const specialPageInfo = await detectSpecialPage(url);
    
    if (specialPageInfo) {
      // console.log('检测到特殊页面:', specialPageInfo);
      // 发送特殊页面消息
      await sendMessageWithRetry({
        action: 'specialPage',
        pageType: specialPageInfo.type,
        message: specialPageInfo.message
      });
      return;
    }
    
    // 获取大纲并发送更新
    const outline = await getPageOutline();
    lastOutlineJson = JSON.stringify(outline);
    
    // 通知background script更新大纲
    try {
      await sendMessageWithRetry({
        action: 'updateOutline',
        outline: outline
      });
      // console.log(`发送初始大纲到background，包含 ${outline.length} 个标题`);
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        // console.error('扩展已失效，无法发送大纲更新');
      } else {
        // console.error('发送大纲更新失败:', error.message || '未知错误');
      }
    }
    
    // 设置观察器
    await setupIntersectionObserver();
    
    // 检测初始可见标题
    await detectVisibleHeading();
    
    // 启动所有观察器
    observers = await setupObservers();
    
    // 确保在页面加载完成后再次检测可见标题
    setTimeout(async () => {
      await detectVisibleHeading();
    }, 500);
    
    // 添加滚动事件监听
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // console.log('初始化完成');
  } catch (error) {
    // console.error('初始化时出错:', error.message || error);
  }
}

// 检测页面是否为特殊页面
async function detectSpecialPage(url) {
  if (!url) return null;
  
  try {
    // 从存储中获取特殊页面列表
    const result = await chrome.storage.sync.get([SPECIAL_PAGES_KEY]);
    const specialPages = result[SPECIAL_PAGES_KEY] || DEFAULT_SPECIAL_PAGES;

    // 查找匹配的特殊页面
    const matchedPage = specialPages.find(page => url.startsWith(page.url));
    if (matchedPage) {
      return {
        type: matchedPage.type,
        message: matchedPage.message
      };
    }
    
    return null;
  } catch (error) {
    // console.error('检测特殊页面时出错:', error);
    return null;
  }
}

// 确保配置已经加载
async function ensureConfigLoaded() {
  if (!configLoaded) {
    await loadConfig();
    configLoaded = true;
  }
    return Promise.resolve();
  }
  
// 主初始化函数
async function initialize() {
  try {
    // 加载配置并确保只加载一次
    await ensureConfigLoaded();
    
    // 配置加载后执行初始化
    await initializeAfterConfigLoaded();
    
  } catch (error) {
    // console.error('初始化失败:', error);
  }
}

// 页面加载完成后执行初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize();
  });
} else {
  // 如果页面已加载完成，立即执行初始化
  initialize();
}

// 增强的防抖函数，包含立即执行选项
function debounce(func, wait, immediate = false) {
  let timeout;
  return function() {
    const context = this;
    const args = arguments;
    const later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

// 添加一个简易的promisify函数来处理chrome.runtime.sendMessage
function sendMessagePromise(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// 监听来自background script的消息 - 统一的消息处理入口
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 检查扩展是否有效
  if (!isExtensionValid() && request.action !== 'extensionInvalidated') {
    sendResponse({ error: 'Extension invalidated' });
    return true;
  }

  // 处理不同类型的消息
  switch (request.action) {
    case 'getOutline':
      // 使用异步方式获取大纲
      (async () => {
        try {
          // 确保配置已加载
          await ensureConfigLoaded();
          
          // 获取大纲
          const outline = await getPageOutline();
          // console.log('获取到大纲，标题数量:', outline.length);
          
          // 发送响应
          sendResponse({ outline: outline });
        } catch (error) {
          // console.error('获取大纲失败:', error);
          sendResponse({ outline: [], error: error.message });
        }
      })();
      return true; // 保持消息通道开放
      
    case 'scrollTo':
      try {
        // 设置手动滚动标志，避免触发自动高亮
        isManualScrolling = true;
        
        const heading = document.getElementById(request.id);
        if (heading) {
          // 平滑滚动到目标位置
          heading.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
          });
          
          // 高亮目标标题
          highlightHeading(request.id);
          
          // 延迟恢复自动检测
          setTimeout(() => {
            isManualScrolling = false;
          }, 1000);
          
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: '找不到目标元素' });
        }
      } catch (error) {
        isManualScrolling = false;
        sendResponse({ success: false, error: error.message });
      }
      return true;
      
    case 'getActiveHeading':
      // 返回当前活动的标题ID
      sendResponse({ headingId: lastActiveHeadingId });
      return true;
      
    case 'detectVisibleHeading':
      // 立即检测当前可见的标题
      (async () => {
        try {
          await detectVisibleHeading();
          sendResponse({ success: true });
        } catch (error) {
          // console.error('检测可见标题失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    case 'configUpdated':
      // 重新加载配置并刷新大纲
      (async () => {
        try {
          // console.log('收到配置更新消息，重新加载配置');
          await loadConfig();
          configLoaded = true;
          
          // 重新获取并发送大纲
          const outline = await getPageOutline();
          await sendMessageWithRetry({
            action: 'updateOutline',
            outline: outline
          });
          
          sendResponse({ success: true });
        } catch (error) {
          // console.error('处理配置更新失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    case 'extensionInvalidated':
      // 扩展状态变化，清理资源
      if (intersectionObserver) {
        intersectionObserver.disconnect();
      }
      
      if (observers) {
        if (observers.contentObserver) observers.contentObserver.disconnect();
        if (observers.outlineObserver) observers.outlineObserver.disconnect();
      }
      sendResponse({ success: true });
      return true;
  }
  
  return false;
});

// 监听页面滚动事件
window.addEventListener('scroll', handleScroll, { passive: true });
