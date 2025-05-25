// 导入常量
import { SIDEPANEL_VISIBILITY_KEY } from './constants.js';

// 导入工具函数
import { detectSpecialPage, isExtensionValid } from './utils.js';

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!isExtensionValid()) {
    return false;
  }
  
  // 获取大纲容器
  const outlineContainer = document.getElementById('outline-container');
  if (!outlineContainer) {
    // console.error('找不到outline-container元素');
    return false;
  }

  if (request.action === 'specialPage') {
    // console.log('收到特殊页面消息:', request);
    
    // 显示特殊页面提示
    outlineContainer.innerHTML = '';
    
    // 创建消息容器
    const messageContainer = document.createElement('div');
    messageContainer.className = 'special-page-message';
    
    // 创建标题
    const title = document.createElement('h3');
    title.textContent = request.pageType;
    messageContainer.appendChild(title);
    
    // 创建消息内容
    const message = document.createElement('p');
    message.textContent = request.message;
    messageContainer.appendChild(message);
    
    // 添加到容器
    outlineContainer.appendChild(messageContainer);
    
    // 清空当前大纲数据
    currentOutline = [];
  } else if (request.action === 'updateOutline') {
    if (request.outline) {
      // console.log('接收到大纲数据更新，标题数量:', request.outline.length);
      
      // 如果标题数量为0，显示无标题结构提示
      if (request.outline.length === 0) {
        outlineContainer.innerHTML = '<p class="empty-outline">当前页面没有标题结构</p>';
        currentOutline = [];
        return;
      }
      
      // 根据页面类型决定显示方式
        // console.log('非特殊页面，显示标题结构');
        displayOutline(request.outline);
    }
  } else if (request.action === 'activeHeading') {
    // 收到活动标题更新，立即高亮
    // console.log('收到活动标题更新:', request.headingId);
    highlightActiveHeading(request.headingId);
  } else if (request.action === 'closeSidePanel') {
    // console.log('关闭侧边栏');
    // 在侧边栏关闭自身 (关闭当前窗口)
    window.close();
  }
  return false;
});

// 当前大纲数据
let currentOutline = [];

// 当前活动的标题ID
let currentActiveHeadingId = null;

// 搜索功能变量
let searchTimer = null;

// 大纲的折叠状态
let isOutlineCollapsed = false;

// 高亮当前活动标题
function highlightActiveHeading(headingId) {
  // 如果没有有效的headingId，不进行操作
  if (!headingId) return;
  
  // 保存当前活动的标题ID
  currentActiveHeadingId = headingId;
  
  // 移除所有现有的活动状态
  const activeItems = document.querySelectorAll('.outline-item.active');
  activeItems.forEach(item => {
    item.classList.remove('active');
  });
  
  // 为当前活动标题添加active类
  const outlineItems = document.querySelectorAll('.outline-item');
  let activeItemFound = false;
  
  outlineItems.forEach(item => {
    if (item.getAttribute('data-id') === headingId) {
      item.classList.add('active');
      activeItemFound = true;
      
      // 确保高亮项在视图内，但使用更平滑的滚动效果
      const container = document.querySelector('.container');
      if (container) {
        const itemRect = item.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // 检查项目是否在容器视图外
        const isOutOfView = 
          itemRect.top < containerRect.top + 30 || // 在顶部视图外（减少缓冲）
          itemRect.bottom > containerRect.bottom - 10; // 在底部视图外（减少缓冲）
          
        if (isOutOfView) {
          // 使用平滑滚动效果，滚动到视图中间位置
          item.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }
      
      // 展开当前活动标题的所有父级
      expandParents(item);
    }
  });
  
  // 如果没有找到对应的项，可能是因为大纲还没更新
  // 将headingId保存起来，等下次大纲更新时再尝试高亮
  if (!activeItemFound) {
    pendingHighlightId = headingId;
  } else {
    pendingHighlightId = null;
  }
}

// 展开所有父级标题
function expandParents(item) {
  let parent = item.parentElement;
  while (parent) {
    if (parent.classList.contains('outline-list')) {
      parent.classList.remove('collapsed');
      const parentItem = parent.previousElementSibling;
      if (parentItem && parentItem.classList.contains('outline-item')) {
        parentItem.classList.remove('collapsed');
      }
    }
    parent = parent.parentElement;
  }
}

// 用于存储等待高亮的ID
let pendingHighlightId = null;

// 创建折叠切换按钮
function createToggleButton() {
  const toggle = document.createElement('span');
  toggle.className = 'toggle-collapse';
  toggle.addEventListener('click', (e) => {
    e.stopPropagation(); // 防止触发标题点击事件
    e.preventDefault();
    
    const item = e.target.closest('.outline-item');
    const sublist = item.nextElementSibling;
    
    if (sublist && sublist.classList.contains('outline-list')) {
      item.classList.toggle('collapsed');
      sublist.classList.toggle('collapsed');
    }
  });
  
  // 使用箭头图标，默认向右，展开时向下
  toggle.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M4 2L8 6L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  `;
  
  return toggle;
}

// 在标题文本中高亮搜索关键词
function highlightSearchTerm(text, searchTerm) {
  if (!searchTerm) return text;
  
  const searchLower = searchTerm.toLowerCase();
  const textLower = text.toLowerCase();
  const index = textLower.indexOf(searchLower);
  
  if (index === -1) return text;
  
  const before = text.substring(0, index);
  const highlight = text.substring(index, index + searchTerm.length);
  const after = text.substring(index + searchTerm.length);
  
  return `${before}<span class="search-highlight">${highlight}</span>${after}`;
}

// 递归构建大纲树
function buildOutlineTree(outline) {
  if (!outline || outline.length === 0) return { tree: [], flat: [] };
  
  const tree = [];
  const flat = [];
  let stack = [];
  
  for (let i = 0; i < outline.length; i++) {
    const currentItem = outline[i];
    const level = currentItem.level;
    
    // 将当前标题添加到扁平列表中
    flat.push(currentItem);
    
    // 处理堆栈，确保我们在正确的层级
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    
    // 创建新的标题节点
    const newNode = {
      ...currentItem,
      children: []
    };
    
    if (stack.length === 0) {
      // 这是顶级标题
      tree.push(newNode);
    } else {
      // 这是子标题，添加到当前堆栈顶部项的子项中
      stack[stack.length - 1].children.push(newNode);
    }
    
    // 将当前项添加到堆栈
    stack.push(newNode);
  }
  
  return { tree, flat };
}

// 递归生成DOM元素
function generateOutlineDom(tree, searchTerm = '') {
  const ul = document.createElement('ul');
  ul.className = 'outline-list';
  
  tree.forEach(item => {
    const li = document.createElement('li');
    li.className = `outline-item h${item.level}`;
    li.setAttribute('data-id', item.id);
    
    // 添加一个包装容器，用于确保文本对齐
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'content-wrapper';
    contentWrapper.style.display = 'flex';
    contentWrapper.style.alignItems = 'center';
    contentWrapper.style.width = '100%';
    
    // 只有有子项时才添加折叠按钮
    if (item.children && item.children.length > 0) {
      const toggle = createToggleButton();
      contentWrapper.appendChild(toggle);
    } else {
      // 为没有子项的标题添加一个空白占位符，保持缩进一致
      const spacer = document.createElement('span');
      spacer.className = 'toggle-spacer';
      spacer.style.width = '16px';
      spacer.style.height = '16px';
      spacer.style.display = 'inline-block';
      spacer.style.marginRight = '5px';
      contentWrapper.appendChild(spacer);
    }
    
    // 创建文本内容容器
    const textContainer = document.createElement('span');
    textContainer.className = 'outline-text';
    
    // 搜索高亮
    if (searchTerm) {
      textContainer.innerHTML = highlightSearchTerm(item.text, searchTerm);
      
      // 如果不匹配搜索条件且无子项匹配，隐藏此项
      const itemText = item.text.toLowerCase();
      const searchLower = searchTerm.toLowerCase();
      
      if (itemText.indexOf(searchLower) === -1) {
        let hasMatchingChild = false;
        
        // 检查是否有匹配的子项
        if (item.children && item.children.length > 0) {
          hasMatchingChild = item.children.some(child => 
            child.text.toLowerCase().indexOf(searchLower) !== -1 ||
            hasMatchingDescendant(child, searchLower)
          );
        }
        
        if (!hasMatchingChild) {
          li.classList.add('hidden');
        }
      }
    } else {
      textContainer.textContent = item.text;
    }
    
    contentWrapper.appendChild(textContainer);
    li.appendChild(contentWrapper);
    ul.appendChild(li);
    
    // 添加点击事件处理
    li.addEventListener('click', async (e) => {
      // 如果点击的是折叠按钮，不执行跳转
      if (e.target.closest('.toggle-collapse')) {
        return;
      }
      
      if (!isExtensionValid()) {
        // console.error('扩展已失效，请刷新页面');
        return;
      }
      
      const headingId = li.getAttribute('data-id');
      if (headingId) {
        try {
          // 添加点击反馈效果
          li.classList.add('clicked');
          
          // 移除之前的所有点击效果
          setTimeout(() => {
            document.querySelectorAll('.outline-item.clicked').forEach(item => {
              if (item !== li) item.classList.remove('clicked');
            });
          }, 100);
          
          // 延迟后移除点击效果
          setTimeout(() => {
            li.classList.remove('clicked');
          }, 500);
          
          // 立即添加高亮效果，提升用户体验
          highlightActiveHeading(headingId);
          
          // 获取当前标签页
          const tabs = await chrome.tabs.query({active: true, currentWindow: true});
          if (tabs.length === 0) {
            // console.error('未找到当前标签页');
            return;
          }
          
          // 发送消息到content script进行滚动
          await chrome.tabs.sendMessage(tabs[0].id, {
            action: 'scrollTo',
            id: headingId
          }).catch(async (error) => {
            // console.error('直接发送消息失败，尝试通过background script:', error);
            
            // 如果直接发送失败，尝试通过background script发送
            await chrome.runtime.sendMessage({
              action: 'scrollTo',
              id: headingId,
              tabId: tabs[0].id
            }).catch(error => {
              // console.error('滚动失败:', error);
            });
          });
        } catch (error) {
          // console.error('处理点击事件失败:', error);
        }
      }
    });
    
    // 如果有子项，递归生成子项
    if (item.children && item.children.length > 0) {
      const sublist = generateOutlineDom(item.children, searchTerm);
      ul.appendChild(sublist);
    }
  });
  
  return ul;
}

// 递归检查是否有匹配的后代
function hasMatchingDescendant(item, searchTerm) {
  if (item.text.toLowerCase().indexOf(searchTerm) !== -1) {
    return true;
  }
  
  if (item.children && item.children.length > 0) {
    return item.children.some(child => hasMatchingDescendant(child, searchTerm));
  }
  
  return false;
}

// 显示大纲
function displayOutline(outline, searchTerm = '') {
  // 保存当前大纲数据
  currentOutline = outline;
  
  // 获取大纲容器
  const outlineContainer = document.getElementById('outline-container');
  if (!outlineContainer) {
    // console.error('找不到outline-container元素');
    return;
  }
  
  // 如果没有大纲数据，显示无标题结构提示
  if (!outline || outline.length === 0) {
    outlineContainer.innerHTML = '<p class="empty-outline">当前页面没有标题结构</p>';
    return;
  }
  
  // 构建大纲树
  const { tree } = buildOutlineTree(outline);
  
  // 生成大纲DOM，传入搜索词
  const outlineDom = generateOutlineDom(tree, searchTerm);
  
  // 清空容器并添加新的大纲
  outlineContainer.innerHTML = '';
  outlineContainer.appendChild(outlineDom);
  
  // 如果有等待高亮的标题，尝试高亮它
  if (pendingHighlightId) {
    highlightActiveHeading(pendingHighlightId);
  }
}

// 折叠所有可折叠的项目
function collapseAllItems() {
  document.querySelectorAll('.outline-item').forEach(item => {
    const nextElement = item.nextElementSibling;
    if (nextElement && nextElement.classList.contains('outline-list')) {
      // 只折叠标题项，标记为折叠状态
      item.classList.add('collapsed');
      // 隐藏其子列表
      nextElement.classList.add('collapsed');
    }
  });
}

// 展开所有折叠的项目
function expandAllItems() {
  const collapsedItems = document.querySelectorAll('.outline-item.collapsed');
  const collapsedLists = document.querySelectorAll('.outline-list.collapsed');
  
  collapsedItems.forEach(item => item.classList.remove('collapsed'));
  collapsedLists.forEach(list => list.classList.remove('collapsed'));
}

// 定位到当前活动标题
async function locateCurrentHeading() {
  if (!isExtensionValid()) {
    // console.error('扩展已失效，请刷新页面');
    return;
  }

  try {
    // 获取当前标签页
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs.length === 0) {
      // console.error('未找到当前标签页');
      return;
    }

    const currentTab = tabs[0];
    // console.log('开始定位当前标题，标签页:', currentTab.url);

    // 先请求content script检测当前可见的标题
    await chrome.tabs.sendMessage(currentTab.id, {
      action: 'detectVisibleHeading'
    });

    // 然后获取当前活动标题
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'getActiveHeading'
    });

    if (response && response.headingId) {
      // console.log('获取到当前活动标题:', response.headingId);
      highlightActiveHeading(response.headingId);
    } else {
      // console.log('未找到当前活动标题，尝试重新检测');
      // 如果没有找到活动标题，再次尝试检测
      await chrome.tabs.sendMessage(currentTab.id, {
        action: 'detectVisibleHeading'
      });
    }
  } catch (error) {
    // console.error('定位当前标题失败:', error);
  }
}

// 初始化时获取当前页面的大纲
function initializeOutline() {
  initializeSearch();
  initializeFoldButton();
  initializeLocateButton();
  initializeSettingsButton();
  initializeRefreshButton();
  initializeMoreButton();
}

// 初始化搜索功能
function initializeSearch() {
  const searchInput = document.getElementById('outline-search');
  const clearButton = document.getElementById('clear-search');
  const searchToggle = document.getElementById('toggle-search');
  const searchContainer = document.getElementById('search-container');
  
  if (!searchInput || !clearButton || !searchToggle || !searchContainer) return;
  
  // 搜索按钮点击事件
  searchToggle.addEventListener('click', function() {
    this.classList.toggle('active');
    
    // 如果搜索框是可见的，则聚焦搜索框
    if (this.classList.contains('active')) {
      searchContainer.classList.remove('hidden');
      searchInput.focus();
    } else {
      // 清空搜索并隐藏搜索框
      searchInput.value = '';
      clearButton.style.display = 'none';
      displayOutline(currentOutline);
      searchContainer.classList.add('hidden');
    }
  });
  
  // 添加输入事件监听
  searchInput.addEventListener('input', function() {
    const searchTerm = this.value.trim();
    
    // 显示/隐藏清除按钮
    clearButton.style.display = searchTerm ? 'block' : 'none';
    
    // 防抖处理，避免频繁重新渲染
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    
    searchTimer = setTimeout(() => {
      // 重新渲染大纲，应用搜索过滤，传入搜索词
      displayOutline(currentOutline, searchTerm);
    }, 300);
  });
  
  // 清除按钮点击事件
  clearButton.addEventListener('click', function() {
    searchInput.value = '';
    clearButton.style.display = 'none';
    displayOutline(currentOutline);
    // 聚焦到搜索框，便于用户继续搜索
    searchInput.focus();
  });
}

// 初始化折叠/展开按钮
function initializeFoldButton() {
  const toggleFoldBtn = document.getElementById('toggle-fold');
  if (!toggleFoldBtn) return;
  
  // 图标元素
  const foldIcon = toggleFoldBtn.querySelector('.fold-icon');
  
  // 设置初始状态
  updateFoldButtonState(toggleFoldBtn, isOutlineCollapsed);
  
  // 折叠/展开按钮点击事件
  toggleFoldBtn.addEventListener('click', function() {
    isOutlineCollapsed = !isOutlineCollapsed;
    
    if (isOutlineCollapsed) {
      // 折叠所有
      collapseAllItems();
    } else {
      // 展开所有
      expandAllItems();
    }
    
    // 更新按钮状态
    updateFoldButtonState(this, isOutlineCollapsed);
  });
}

// 更新折叠按钮状态（图标和提示文本）
function updateFoldButtonState(button, isCollapsed) {
  const foldIcon = button.querySelector('.fold-icon');
  
  if (isCollapsed) {
    // 当前是折叠状态，下一步操作是展开
    button.title = '全部展开';
    foldIcon.classList.add('expanded');
  } else {
    // 当前是展开状态，下一步操作是折叠
    button.title = '全部折叠';
    foldIcon.classList.remove('expanded');
  }
}

// 初始化定位当前标题按钮
function initializeLocateButton() {
  const locateButton = document.getElementById('locate-current');
  if (locateButton) {
    locateButton.addEventListener('click', locateCurrentHeading);
  }
}

// 初始化设置按钮
function initializeSettingsButton() {
  const settingsButton = document.getElementById('open-settings');
  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
}

// 初始化刷新按钮
function initializeRefreshButton() {
  const refreshButton = document.getElementById('refresh-page');
  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      try {
        // 获取当前标签页
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs.length > 0) {
          // 刷新当前标签页
          await chrome.tabs.reload(tabs[0].id);
        }
      } catch (error) {
        // console.error('刷新页面失败:', error);
      }
    });
  }
}

// 初始化更多按钮
function initializeMoreButton() {
  const moreButton = document.getElementById('more-actions');
  const moreMenu = document.querySelector('.more-menu');
  const refreshAllButton = document.getElementById('refresh-all-tabs');
  
  if (!moreButton || !moreMenu || !refreshAllButton) return;
  
  // 点击更多按钮显示/隐藏菜单
  moreButton.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu.classList.toggle('hidden');
  });
  
  // 点击刷新所有标签页按钮
  refreshAllButton.addEventListener('click', async () => {
    try {
      // 获取所有标签页
      const tabs = await chrome.tabs.query({});
      // 刷新所有标签页
      for (const tab of tabs) {
        await chrome.tabs.reload(tab.id);
      }
      // 隐藏菜单
      moreMenu.classList.add('hidden');
    } catch (error) {
      // console.error('刷新所有标签页失败:', error);
    }
  });
  
  // 点击页面其他地方时隐藏菜单
  document.addEventListener('click', (e) => {
    if (!moreButton.contains(e.target) && !moreMenu.contains(e.target)) {
      moreMenu.classList.add('hidden');
    }
  });
}

// 监听系统主题变化
function handleThemeChange(e) {
  if (e.matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化各组件
  initializeSearch();
  initializeFoldButton();
  initializeLocateButton();
  initializeSettingsButton();
  initializeRefreshButton();
  initializeMoreButton();
  
  // 设置初始主题
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  handleThemeChange(darkModeMediaQuery);
  
  // 监听主题变化
  darkModeMediaQuery.addListener(handleThemeChange);

  // 显示初始加载状态
  const outlineContainer = document.getElementById('outline-container');
  if (outlineContainer) {
    outlineContainer.innerHTML = '<p class="loading-outline">正在加载当前页面大纲...</p>';
  }

  // 获取当前标签页，显示其大纲
  chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
    if (tabs && tabs.length > 0) {
      const currentTab = tabs[0];
      // console.log('当前标签页:', currentTab.url);
      // 1. 检查是否是特殊页面
      const specialPageInfo = await detectSpecialPage(currentTab.url);
      if (specialPageInfo) {
        // console.log('检测到特殊页面:', specialPageInfo);
        if (outlineContainer) {
          // 清空容器
          outlineContainer.innerHTML = '';
          
          // 创建消息容器
          const messageContainer = document.createElement('div');
          messageContainer.className = 'special-page-message';
          
          // 创建标题
          const title = document.createElement('h3');
          title.textContent = specialPageInfo.type || '特殊页面';
          messageContainer.appendChild(title);
          
          // 创建消息内容
          const message = document.createElement('p');
          message.textContent = specialPageInfo.message || '此页面没有可用的大纲';
          messageContainer.appendChild(message);
          
          // 添加到容器
          outlineContainer.appendChild(messageContainer);
          
          // 清空当前大纲数据
          currentOutline = [];
        }
        return;
      }

      // 2. 获取大纲内容
      // 等待一段时间后发送消息
      setTimeout(() => {
        // 使用直接消息请求获取大纲
        chrome.tabs.sendMessage(currentTab.id, {action: 'getOutline'}, (response) => {
          if (response && response.outline) {
            // console.log('已直接获取大纲，标题数量:', response.outline.length);
            // 显示大纲
            displayOutline(response.outline);
          } else {
            // console.log('未获取到大纲，延迟后再次尝试');
          }
        });
    }, 500);
    }
  });
});

// 监听扩展状态变化
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extensionInvalidated') {
    // console.error('扩展已失效，请刷新页面');
  }
  return false;
});

// 添加特殊页面消息的样式
const style = document.createElement('style');
style.textContent = `
  .special-page-message {
    padding: 20px;
    text-align: center;
    color: var(--text-color);
  }
  
  .special-page-message h3 {
    margin: 0 0 10px 0;
    font-size: 18px;
    color: var(--text-color);
  }
  
  .special-page-message p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-color);
  }
`;
document.head.appendChild(style); 