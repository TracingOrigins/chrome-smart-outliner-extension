// 导入常量
import { SPECIAL_PAGES_KEY, DEFAULT_SPECIAL_PAGES, SIDEPANEL_VISIBILITY_KEY } from './constants.js';


/**
 * 检测页面是否为特殊页面
 * @param {string} url - 要检测的URL
 * @returns {Object|null} 如果是特殊页面，返回包含类型和消息的对象；否则返回null
 */
export async function detectSpecialPage(url) {
  if (!url) return null;
  
  const result = await chrome.storage.sync.get([SPECIAL_PAGES_KEY]);
  const specialPages = result[SPECIAL_PAGES_KEY] || DEFAULT_SPECIAL_PAGES;
  
  const specialPage = specialPages.find(page => url.startsWith(page.url));
  if (specialPage) {
    return {
      type: specialPage.type,
      message: specialPage.message
    };
  }
  
  return null;
}

/**
 * 检查页面是否为特殊页面
 * @param {string} url - 要检查的URL
 * @returns {boolean} 如果是特殊页面返回true，否则返回false
 */
export function isSpecialPage(url) {
  return detectSpecialPage(url) !== null;
}

/**
 * 处理来自侧边栏的获取大纲请求
 * 
 * @param {Object} params - 参数对象
 * @param {string} params.url - 要处理的页面URL
 * @param {number} params.tabId - 标签页ID
 * @param {Function} params.sendResponse - 用于发送响应的函数
 * @returns {Promise<boolean>} 是否异步处理响应的标志
 */
export async function handleGetOutlineRequest({ url, tabId, sendResponse }) {
  try {
    // 1. 首先检查是否为特殊页面
    const specialPageInfo = await detectSpecialPage(url);
    if (specialPageInfo) {
      // console.log('检测到特殊页面:', specialPageInfo);
      // 发送特殊页面消息到侧边栏
      await chrome.runtime.sendMessage({
        action: 'specialPage',
        pageType: specialPageInfo.type,
        message: specialPageInfo.message
      });
      sendResponse({ outline: [] });
      return true;
    }

    // 2. 获取大纲
    chrome.tabs.sendMessage(tabId, {
      action: 'getOutline'
    }, (response) => {
      if (chrome.runtime.lastError) {
        // console.error('获取大纲失败:', chrome.runtime.lastError);
        sendResponse({ outline: [] });
        return;
      }
      
      if (response && response.outline) {
        // console.log('成功获取大纲，标题数量:', response.outline.length);
        sendResponse(response);
      } else {
        // console.log('获取到空大纲或无效响应');
        sendResponse({ outline: [] });
      }
    });
    return true;
  } catch (error) {
    // console.error('处理getOutline请求时出错:', error);
    // 发生错误时，发送特殊消息表示出错
    chrome.runtime.sendMessage({
      action: 'specialPage',
      pageType: '发生错误',
      message: '获取页面大纲时出错: ' + error.message
    }).catch(err => {
      // console.error('发送错误消息失败:', err);
    });
    sendResponse({ outline: [], error: error.message });
    return true;
  }
}

/**
 * 检查扩展是否有效
 * @returns {boolean} 如果扩展有效返回true，否则返回false
 */
export function isExtensionValid() {
  return chrome.runtime && chrome.runtime.id;
}

/**
 * 检查标签页是否仍然存在
 * @param {number} tabId - 标签页ID
 * @returns {Promise<boolean>} 如果标签页存在返回true，否则返回false
 */
export async function checkTabExists(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return !!tab;
  } catch (error) {
    return false;
  }
}