// 存储当前活动的标签页ID
let currentTabId = null;

// 导入工具函数
import { detectSpecialPage, isSpecialPage, handleGetOutlineRequest, checkTabExists, isExtensionValid } from './utils.js';

// 初始化
(async function initialize() {
  if (!isExtensionValid()) {
    // console.error('扩展无效，无法初始化');
    return;
  }
  
  try {
    // 设置侧边栏行为
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    // console.log('侧边栏行为设置成功');

    // 获取当前活动标签页
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs.length > 0) {
      currentTabId = tabs[0].id;
      // console.log('初始化当前标签页ID:', currentTabId);
    }
  } catch (error) {
    // console.error('初始化失败:', error);
  }
})();

// 监听标签页切换事件
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!isExtensionValid()) {
    return;
  }

  try {
    // 获取当前标签页信息
    const tabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(activeInfo.tabId);
    // console.log('【标签页切换】开始处理:', tab.url);

    // 1. 检查是否是特殊页面
    const specialPageInfo = await detectSpecialPage(tab.url);
    if (specialPageInfo) {
      // console.log('【特殊页面】发送特殊页面消息到侧边栏:', specialPageInfo);
      // 发送特殊页面消息到侧边栏
      try {
        await chrome.runtime.sendMessage({
          action: 'specialPage',
          pageType: specialPageInfo.type,
          message: specialPageInfo.message
        });
      } catch (error) {
        // console.error('【特殊页面】发送消息失败:', error);
      }
      return;
    }

    // 2. 获取大纲内容
    // 等待一段时间后发送消息
    setTimeout(() => {
      // 发送消息获取大纲
      chrome.tabs.sendMessage(tabId, { action: 'getOutline' }, (response) => {
        if (chrome.runtime.lastError) {
          // console.error('获取大纲失败:', chrome.runtime.lastError);
          return;
        }
        
        if (response && response.outline) {
          // console.log('获取到大纲:', response.outline);

          // 通知侧边栏更新大纲
          chrome.runtime.sendMessage({
            action: 'updateOutline',
            tabId: tabId,
            outline: response.outline
          }).catch(error => {
            // console.error('通知侧边栏更新大纲失败:', error);
          });

        } else {
          // console.error('获取大纲失败: 响应无效');
        }
      });
    }, 500);

  } catch (error) {
    // console.error('【标签页切换】处理过程中出错:', error);
  }
});

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!isExtensionValid()) {
    return;
  }

  try {
    // console.log('【标签页更新】开始处理:', tab.url);

    // 1. 检查是否是特殊页面
    const specialPageInfo = await detectSpecialPage(tab.url);
    if (specialPageInfo) {
      // console.log('【特殊页面】发送特殊页面消息到侧边栏:', specialPageInfo);
      // 发送特殊页面消息到侧边栏
      try {
        await chrome.runtime.sendMessage({
          action: 'specialPage',
          pageType: specialPageInfo.type,
          message: specialPageInfo.message
        });
      } catch (error) {
        // console.error('【特殊页面】发送消息失败:', error);
      }
      return;
    }
    
    // // 2. 获取大纲内容
    // if (changeInfo.status === 'complete') {
    //   // console.log('页面加载完成:', tab.url);
      
    //   // 等待一段时间后发送消息
    //   setTimeout(() => {
    //     // 发送消息获取大纲
    //     chrome.tabs.sendMessage(tabId, { action: 'getOutline' }, (response) => {
    //       if (chrome.runtime.lastError) {
    //         // console.error('获取大纲失败:', chrome.runtime.lastError);
    //         chrome.tabs.reload(tabId);
    //         return;
    //       }
          
    //       if (response && response.outline) {
    //         // console.log('获取到大纲:', response.outline);

    //         // 通知侧边栏更新大纲
    //         chrome.runtime.sendMessage({
    //           action: 'updateOutline',
    //           tabId: tabId,
    //           outline: response.outline
    //         }).catch(error => {
    //           // console.error('通知侧边栏更新大纲失败:', error);
    //         });

    //       } else {
    //         // console.error('获取大纲失败: 响应无效');
    //       }
    //     });
    //   }, 500);
    // }

  } catch (error) {
    // console.error('【标签页更新】处理过程中出错:', error);
  }
});

// 监听来自content script和侧边栏的消息
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (!isExtensionValid()) {
    sendResponse({ error: 'Extension invalidated' });
    return false;
  }

  try {
    // 检查标签页是否存在
    if (!currentTabId || !(await checkTabExists(currentTabId))) {
      sendResponse({ error: 'No active tab' });
      return false;
    }

    // 处理来自content script的消息
    if (sender.tab) {
      if (request.action === 'updateOutline') {
        // console.log("将消息转发给侧边栏")
        // console.log(request.outline.length)

        // 将消息转发给侧边栏
        chrome.runtime.sendMessage({
          action: 'updateOutline',
          outline: request.outline
        }).catch(() => {
          // 忽略发送失败的错误
        });
        sendResponse({ success: true });
      } else if (request.action === 'activeHeading') {
        // 将当前活动标题消息转发给侧边栏
        chrome.runtime.sendMessage({
          action: 'activeHeading',
          headingId: request.headingId
        }).catch(() => {
          // 忽略发送失败的错误
        });
        sendResponse({ success: true });
      } else if (request.action === 'specialPage') {
        // 处理特殊页面消息
        // console.log('收到特殊页面消息:', request);
        // 发送特殊页面消息
        await chrome.runtime.sendMessage({
          action: 'specialPage',
          pageType: request.pageType,
          message: request.message
        }).catch(() => {
          // 忽略发送失败的错误
        });
        sendResponse({ success: true });
      }
    }
    // 处理来自侧边栏的消息
    else {
      if (request.action === 'getOutline') {
        try {
          // 使用utils中的handleGetOutlineRequest函数处理getOutline请求
          return await handleGetOutlineRequest({ 
            url: request.url, 
            tabId: request.tabId, 
            sendResponse: sendResponse 
          });
        } catch (error) {
          // console.error('处理getOutline请求时出错:', error);
          sendResponse({ outline: [], error: error.message });
          return true;
        }
      } else if (request.action === 'scrollTo') {
        chrome.tabs.sendMessage(currentTabId, {
          action: 'scrollTo',
          id: request.id
        }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false });
            return;
          }
          sendResponse(response || { success: false });
        });
        return true;
      } else if (request.action === 'getActiveHeading') {
        chrome.tabs.sendMessage(currentTabId, {action: 'getActiveHeading'}, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ headingId: null });
            return;
          }
          sendResponse(response || { headingId: null });
        });
        return true;
      }
    }
  } catch (error) {
    sendResponse({ error: error.message });
  }
  return false;
});

// 监听存储变化事件，当域名列表更新时通知所有标签页
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.all_headings_domains) {
    // console.log('域名列表已更新，通知所有标签页重新加载配置');
    // 获取所有标签页
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        try {
          // 跳过不支持的标签页（如chrome://开头的特殊页面）
          if (isSpecialPage(tab.url)) {
            continue;
          }
          
          // 向每个标签页发送配置更新消息
          chrome.tabs.sendMessage(tab.id, { action: 'configUpdated' })
            .catch(() => {
              // 忽略发送失败，可能是该标签页没有内容脚本
            });
        } catch (error) {
          // 忽略单个标签页的错误，继续处理其他标签页
        }
      }
    });
  }
});

// 监听扩展被禁用或卸载
chrome.runtime.onSuspend.addListener(() => {
  // 通知所有打开的侧边栏
  chrome.runtime.sendMessage({ action: 'extensionInvalidated' }).catch(() => {
    // 忽略发送失败的错误
  });
});