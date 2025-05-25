// 导入常量
import { ALL_HEADINGS_DOMAINS_KEY, SPECIAL_PAGES_KEY, DEFAULT_SPECIAL_PAGES } from './constants.js';

// DOM元素
const websiteInput = document.getElementById('website');
const addButton = document.getElementById('add-website');
const websiteList = document.getElementById('website-list');
const statusMessage = document.getElementById('status-message');

// 特殊页面相关DOM元素
const specialPageInput = document.getElementById('special-page');
const specialPageTypeInput = document.getElementById('special-page-type');
const specialPageMessageInput = document.getElementById('special-page-message');
const addSpecialPageButton = document.getElementById('add-special-page');
const restoreDefaultButton = document.getElementById('restore-default-special-pages');
const specialPageList = document.getElementById('special-page-list');
const specialPageStatusMessage = document.getElementById('special-page-status-message');

// 显示状态消息
function showStatusMessage(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message ' + type;
  statusMessage.style.display = 'block';
  
  // 5秒后隐藏消息
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 5000);
}

// 显示特殊页面状态消息
function showSpecialPageStatusMessage(message, type = 'info') {
  specialPageStatusMessage.textContent = message;
  specialPageStatusMessage.className = 'status-message ' + type;
  specialPageStatusMessage.style.display = 'block';
  
  setTimeout(() => {
    specialPageStatusMessage.style.display = 'none';
  }, 5000);
}

// 清理和验证域名
function cleanDomain(domain) {
  // 移除协议前缀
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/i, '');
  
  // 移除路径和查询参数
  domain = domain.split('/')[0];
  
  // 移除端口
  domain = domain.split(':')[0];
  
  // 去除空格并转为小写
  domain = domain.trim().toLowerCase();
  
  return domain;
}

// 加载已保存的网站列表
function loadWebsites() {
  chrome.storage.sync.get([ALL_HEADINGS_DOMAINS_KEY], (result) => {
    const domains = result[ALL_HEADINGS_DOMAINS_KEY] || [];
    renderWebsiteList(domains);
  });
}

// 渲染网站列表
function renderWebsiteList(domains) {
  // 清空列表
  websiteList.innerHTML = '';
  
  if (domains.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-message';
    emptyMessage.textContent = '暂无添加的网站';
    websiteList.appendChild(emptyMessage);
    return;
  }
  
  // 添加每个网站项
  domains.forEach(domain => {
    const item = document.createElement('div');
    item.className = 'website-item';
    
    const domainText = document.createElement('span');
    domainText.textContent = domain;
    item.appendChild(domainText);
    
    const removeButton = document.createElement('button');
    removeButton.className = 'btn-remove';
    removeButton.textContent = '删除';
    removeButton.onclick = () => removeDomain(domain);
    item.appendChild(removeButton);
    
    websiteList.appendChild(item);
  });
}

// 添加域名
function addDomain() {
  const domain = cleanDomain(websiteInput.value);
  
  // 验证域名
  if (!domain) {
    showStatusMessage('请输入有效的域名', 'error');
    return;
  }
  
  chrome.storage.sync.get([ALL_HEADINGS_DOMAINS_KEY], (result) => {
    const domains = result[ALL_HEADINGS_DOMAINS_KEY] || [];
    
    // 检查是否已存在
    if (domains.includes(domain)) {
      showStatusMessage('该网站已在列表中', 'info');
    } else {
      domains.push(domain);
      chrome.storage.sync.set({ [ALL_HEADINGS_DOMAINS_KEY]: domains }, () => {
        if (chrome.runtime.lastError) {
          showStatusMessage('保存失败: ' + chrome.runtime.lastError.message, 'error');
        } else {
          showStatusMessage('成功添加网站', 'success');
          renderWebsiteList(domains);
          websiteInput.value = '';
        }
      });
    }
  });
}

// 删除域名
function removeDomain(domain) {
  chrome.storage.sync.get([ALL_HEADINGS_DOMAINS_KEY], (result) => {
    const domains = result[ALL_HEADINGS_DOMAINS_KEY] || [];
    const newDomains = domains.filter(d => d !== domain);
    
    chrome.storage.sync.set({ [ALL_HEADINGS_DOMAINS_KEY]: newDomains }, () => {
      if (chrome.runtime.lastError) {
        showStatusMessage('删除失败: ' + chrome.runtime.lastError.message, 'error');
      } else {
        showStatusMessage('已删除网站', 'success');
        renderWebsiteList(newDomains);
      }
    });
  });
}

// 加载特殊页面列表
function loadSpecialPages() {
  chrome.storage.sync.get([SPECIAL_PAGES_KEY], (result) => {
    const specialPages = result[SPECIAL_PAGES_KEY] || DEFAULT_SPECIAL_PAGES;
    renderSpecialPageList(specialPages);
  });
}

// 渲染特殊页面列表
function renderSpecialPageList(specialPages) {
  specialPageList.innerHTML = '';
  
  if (specialPages.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-message';
    emptyMessage.textContent = '暂无添加的特殊页面';
    specialPageList.appendChild(emptyMessage);
    return;
  }
  
  specialPages.forEach(page => {
    const item = document.createElement('div');
    item.className = 'website-item';
    
    const pageInfo = document.createElement('div');
    pageInfo.style.flex = '1';
    
    const urlText = document.createElement('div');
    urlText.textContent = `URL: ${page.url}`;
    pageInfo.appendChild(urlText);
    
    const typeText = document.createElement('div');
    typeText.textContent = `类型: ${page.type}`;
    pageInfo.appendChild(typeText);
    
    const messageText = document.createElement('div');
    messageText.textContent = `提示: ${page.message}`;
    pageInfo.appendChild(messageText);
    
    item.appendChild(pageInfo);
    
    const removeButton = document.createElement('button');
    removeButton.className = 'btn-remove';
    removeButton.textContent = '删除';
    removeButton.onclick = () => removeSpecialPage(page.url);
    item.appendChild(removeButton);
    
    specialPageList.appendChild(item);
  });
}

// 添加特殊页面
function addSpecialPage() {
  const url = specialPageInput.value.trim();
  const type = specialPageTypeInput.value.trim();
  const message = specialPageMessageInput.value.trim();
  
  if (!url || !type || !message) {
    showSpecialPageStatusMessage('请填写所有字段', 'error');
    return;
  }
  
  chrome.storage.sync.get([SPECIAL_PAGES_KEY], (result) => {
    const specialPages = result[SPECIAL_PAGES_KEY] || DEFAULT_SPECIAL_PAGES;
    
    // 检查是否已存在
    if (specialPages.some(page => page.url === url)) {
      showSpecialPageStatusMessage('该特殊页面已在列表中', 'info');
    } else {
      specialPages.push({ url, type, message });
      chrome.storage.sync.set({ [SPECIAL_PAGES_KEY]: specialPages }, () => {
        if (chrome.runtime.lastError) {
          showSpecialPageStatusMessage('保存失败: ' + chrome.runtime.lastError.message, 'error');
        } else {
          showSpecialPageStatusMessage('成功添加特殊页面', 'success');
          renderSpecialPageList(specialPages);
          specialPageInput.value = '';
          specialPageTypeInput.value = '';
          specialPageMessageInput.value = '';
        }
      });
    }
  });
}

// 删除特殊页面
function removeSpecialPage(url) {
  chrome.storage.sync.get([SPECIAL_PAGES_KEY], (result) => {
    const specialPages = result[SPECIAL_PAGES_KEY] || DEFAULT_SPECIAL_PAGES;
    const newSpecialPages = specialPages.filter(page => page.url !== url);
    
    chrome.storage.sync.set({ [SPECIAL_PAGES_KEY]: newSpecialPages }, () => {
      if (chrome.runtime.lastError) {
        showSpecialPageStatusMessage('删除失败: ' + chrome.runtime.lastError.message, 'error');
      } else {
        showSpecialPageStatusMessage('已删除特殊页面', 'success');
        renderSpecialPageList(newSpecialPages);
      }
    });
  });
}

// 恢复默认特殊页面设置
function restoreDefaultSpecialPages() {
  chrome.storage.sync.set({ [SPECIAL_PAGES_KEY]: DEFAULT_SPECIAL_PAGES }, () => {
    if (chrome.runtime.lastError) {
      showSpecialPageStatusMessage('恢复失败: ' + chrome.runtime.lastError.message, 'error');
    } else {
      showSpecialPageStatusMessage('已恢复默认特殊页面设置', 'success');
      renderSpecialPageList(DEFAULT_SPECIAL_PAGES);
    }
  });
}

// 事件监听
document.addEventListener('DOMContentLoaded', () => {
  loadWebsites();
  loadSpecialPages();
});

addButton.addEventListener('click', addDomain);
addSpecialPageButton.addEventListener('click', addSpecialPage);
restoreDefaultButton.addEventListener('click', restoreDefaultSpecialPages);

// 按回车添加
websiteInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    addDomain();
  }
});

specialPageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    addSpecialPage();
  }
}); 