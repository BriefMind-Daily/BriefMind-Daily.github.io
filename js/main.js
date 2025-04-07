// Global variables
let preloadedData = {
    wechatArticles: null,
    papers: null,
    arxivPapers: null,  // 新增 arxiv 论文数据
    fields: new Set(),
    institutions: new Set(),
    selectedFields: new Set(['LLM']),  // 默认选中LLM领域
    selectedInstitutions: new Set(['all'])
};

// 日期相关变量
let selectedDate = formatDate(new Date()); // 默认使用今天的日期，而不是'latest'
const DATE_FORMAT = 'YYYY-MM-DD'; // 日期格式
const DAYS_TO_KEEP = 7; // 保留最近7天的数据

// 预定义的领域和机构列表
const PREDEFINED_FIELDS = ['LLM', 'Diffusion Model', 'Multimodal LLM', 'Embodied AI', 'Agent', 'AGI', 'AI4Science', 'Other'];
const PREDEFINED_INSTITUTIONS = ['DeepMind', 'Meta', 'Microsoft', 'OpenAI', 'Shanghai AI Lab', 'ByteDance', 'THU', 'PKU', 'Tencent', 'Alibaba', 'Amazon', 'Other'];

// Constants
const CACHE_EXPIRATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const CACHE_KEYS = {
    WECHAT_ARTICLES: 'wechatArticles',
    PAPERS: 'papers',
    ARXIV_PAPERS: 'arxivPapers',  // 新增 arxiv 论文缓存键
    LAST_UPDATED: 'lastUpdated'
};

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 清理Markdown格式的函数
function cleanMarkdown(text) {
    if (!text) return '';
    
    // 只移除标题和链接格式，保留其他 Markdown 格式
    let cleaned = text.replace(/#{1,6}\s+/g, '');          // 移除标题 # Heading
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // 移除链接 [text](url)
    
    return cleaned;
}

// DOM Ready
document.addEventListener('DOMContentLoaded', function() {
    // Clear local storage if it's older than the expiration time
    clearExpiredCache();
    
    // Check if templates exist
    if (!document.getElementById('article-template') || !document.getElementById('paper-template')) {
        console.error('Templates not found');
        return;
    }
    
    // 初始化预定义的领域和机构列表
    initPredefinedFieldsAndInstitutions();
    
    // Initialize navigation effects
    initNavbarScroll();
    
    // Initialize smooth scrolling
    initSmoothScroll();
    
    // Initialize data
    initData();
    
    // Initialize smooth scrolling
    initSmoothScroll();
    
    // Add event listener for notes toggle buttons
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('toggle-notes-btn') || 
            (e.target.parentElement && e.target.parentElement.classList.contains('toggle-notes-btn'))) {
            
            const button = e.target.classList.contains('toggle-notes-btn') ? e.target : e.target.parentElement;
            const paperId = button.getAttribute('data-paper-id');
            const notesContainer = document.getElementById(`paper-notes-${paperId}`);
            
            if (notesContainer) {
                toggleNotes(button, notesContainer, paperId);
            }
        }
    });
    
    // 初始化筛选器事件监听
    initFilters();
    
    // 立即填充筛选器选项
    populateFilterOptions();
    
    // 初始化日期选择器
    initDateFilter();
});

// Toggle notes visibility
function toggleNotes(button, notesContainer, paperId) {
    const isActive = notesContainer.classList.contains('active');
    
    if (isActive) {
        // Hide notes
        notesContainer.classList.remove('active');
        button.innerHTML = '<i class="fas fa-book-open"></i> 展开笔记';
    } else {
        // Show notes
        notesContainer.classList.add('active');
        button.innerHTML = '<i class="fas fa-book"></i> 收起笔记';
        
        // If notes are empty, load them
        if (notesContainer.innerHTML.trim() === '' || notesContainer.querySelector('.notes-loading')) {
            loadPaperNotes(paperId, notesContainer);
        }
    }
}

// Load paper notes
function loadPaperNotes(paperId, notesContainer) {
    // Show loading spinner
    notesContainer.innerHTML = '<div class="notes-loading"><div class="spinner"></div></div>';
    
    // Find the paper in preloaded data
    const paper = preloadedData.papers.find(p => p.id === paperId);
    
    if (paper && paper.notes) {
        // Use setTimeout to simulate loading (can be removed in production)
        setTimeout(() => {
            // 使用 marked.js 渲染 Markdown 内容
            if (window.marked) {
                notesContainer.innerHTML = marked.parse(paper.notes);
            } else {
                // 如果 marked.js 不可用，使用简单的 HTML 转换
                const html = paper.notes
                    .replace(/\n/g, '<br>')
                    .replace(/^\* (.*?)$/gm, '<li>$1</li>')
                    .replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');
                notesContainer.innerHTML = html;
            }
        }, 300);
    } else {
        notesContainer.innerHTML = '<p>无法加载笔记内容</p>';
    }
}

// Initialize navbar scroll effect
function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    window.addEventListener('scroll', throttle(function() {
        if (window.scrollY > 50) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }
    }, 100));
}

// Initialize smooth scrolling for anchor links
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                // 计算偏移量，考虑导航栏的高度
                const navbarHeight = document.querySelector('.navbar').offsetHeight;
                const offset = navbarHeight + 40; // 增加额外的空间，确保内容不会被导航栏遮挡
                
                // 滚动到目标元素
                window.scrollTo({
                    top: targetElement.offsetTop - offset,
                    behavior: 'smooth'
                });
                
                // 在窄屏幕上关闭导航菜单
                const navbarToggler = document.querySelector('.navbar-toggler');
                const navbarCollapse = document.querySelector('.navbar-collapse');
                if (navbarToggler && navbarCollapse && window.getComputedStyle(navbarToggler).display !== 'none') {
                    // 使用Bootstrap的collapse方法关闭菜单
                    if (typeof bootstrap !== 'undefined') {
                        const bsCollapse = new bootstrap.Collapse(navbarCollapse);
                        bsCollapse.hide();
                    } else {
                        // 备用方法：直接移除show类
                        navbarCollapse.classList.remove('show');
                    }
                }
            }
        });
    });
}

// Initialize data
function initData() {
    clearExpiredCache();
    
    const cachedData = getCachedData();
    if (cachedData && cachedData.wechatArticles && cachedData.papers && cachedData.arxivPapers) {
        console.log('Using cached data');
    
        // 保存当前的 fields 和 institutions 集合
        const fields = preloadedData.fields;
        const institutions = preloadedData.institutions;
        
        preloadedData = cachedData;
        
        // 恢复Set类型
        preloadedData.fields = fields;
        preloadedData.institutions = institutions;
        
        // 修复缓存数据中可能存在的 arxiv 链接
        if (preloadedData.arxivPapers) {
            preloadedData.arxivPapers = fixAlphaXivLinks(preloadedData.arxivPapers);
        }
        if (preloadedData.papers) {
            preloadedData.papers = fixAlphaXivLinks(preloadedData.papers);
        }
        
        renderData();
    }
    
    // 获取URL参数中的日期
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get('date');
    
    // 如果URL中有日期参数，使用该日期
    if (dateParam) {
        selectedDate = dateParam;
        
        // 更新日期选择器的选中值
        const dateFilter = document.getElementById('date-filter');
        if (dateFilter) {
            // 检查日期选择器中是否有该日期选项
            const option = Array.from(dateFilter.options).find(opt => opt.value === dateParam);
            if (option) {
                dateFilter.value = dateParam;
            } else {
                // 如果没有该日期选项，添加一个
                const newOption = document.createElement('option');
                newOption.value = dateParam;
                newOption.textContent = `${dateParam}`;
                dateFilter.appendChild(newOption);
                dateFilter.value = dateParam;
            }
        }
    }
    
    // 加载指定日期的数据
    loadDataForDate(selectedDate);
}

// Fetch WeChat articles
function fetchWechatArticles(date = selectedDate) {
    console.log('Fetching WeChat articles...');
    
    // 保存当前的筛选设置，以免在加载数据时被覆盖
    const savedSelectedFields = preloadedData.selectedFields ? new Set(preloadedData.selectedFields) : new Set(['all']);
    const savedSelectedInstitutions = preloadedData.selectedInstitutions ? new Set(preloadedData.selectedInstitutions) : new Set(['all']);
    
    // 构建文件名 - 始终使用日期
    const filename = `wechat_articles_${date}.csv`;
    
    fetch(filename)
        .then(response => {
            console.log('WeChat articles response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(csvText => {
            console.log('Raw CSV text length:', csvText.length); // 添加原始CSV内容长度日志
            
            // Parse CSV text
            const lines = csvText.split('\n');
            console.log('CSV lines count:', lines.length); // 添加分行后的行数日志
            
            // 确保至少有标题行
            if (lines.length < 1) {
                throw new Error('CSV file is empty or invalid');
            }
            
            const headers = lines[0].split(',');
            console.log('CSV headers:', headers); // 添加表头日志
            
            // 改进CSV解析逻辑，处理引号内的逗号
            const articles = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === '') continue; // 跳过空行
                
                console.log(`Processing line ${i}:`, line.substring(0, 50) + '...'); // 添加每行处理日志（只显示前50个字符）
                
                // 使用更可靠的CSV解析方法
                const values = parseCSVLine(line);
                console.log(`Line ${i} parsed values:`, values.length); // 添加解析后的值数量
                
                if (values.length !== headers.length) {
                    console.warn(`Line ${i} has ${values.length} values, expected ${headers.length}`);
                    // 如果值的数量不匹配，尝试调整
                    if (values.length < headers.length) {
                        // 如果值少于标题，添加空值
                        while (values.length < headers.length) {
                            values.push('');
                        }
                    } else {
                        // 如果值多于标题，截断
                        values.length = headers.length;
                    }
                }
                
                const article = {};
                
                // 字段映射
                const fieldMap = {
                    '公众号': 'source',
                    '发布时间': 'date',
                    '原标题': 'title',
                    '科技报告标题': 'report_title',
                    '一句话总结': 'brief_summary',
                    '摘要': 'summary',
                    'URL': 'url',
                    '领域分类': 'field',
                    '研究机构': 'institution',
                    '行业大佬': 'industry_leader'
                };
                
                headers.forEach((header, index) => {
                    const value = values[index];
                    // 移除可能存在的引号并清理空格
                    const cleanValue = value ? value.replace(/^"|"$/g, '').trim() : '';
                    const mappedField = fieldMap[header.trim()] || header.trim();
                    article[mappedField] = cleanValue;
                });
                
                articles.push(article);
            }
            
            console.log('Processed WeChat articles:', articles.length); // 添加处理后的文章数量日志
            preloadedData.wechatArticles = articles;
            
            // 使用预定义的领域和机构列表，而不是从CSV提取
            initPredefinedFieldsAndInstitutions();
            
            // 更新筛选器选项
            populateFilterOptions();
            
            // 恢复用户的筛选设置
            preloadedData.selectedFields = savedSelectedFields;
            preloadedData.selectedInstitutions = savedSelectedInstitutions;
            
            updateCache();
            renderWechatArticles(articles);
        })
        .catch(error => {
            console.error('Error fetching WeChat articles:', error);
            
            // 修改错误提示，使用"暂无推文"而不是"内容加载失败"
            document.getElementById('wechat-articles-container').innerHTML = 
                '<div class="col-12 text-center mt-4 mb-4"><div class="empty-state"><i class="fas fa-inbox fa-3x mb-3"></i><h4>暂无推文</h4></div></div>';
            
            // 设置空数组而不是null，这样筛选时能正确处理
            preloadedData.wechatArticles = [];
            
            // 即使加载文章失败，也初始化预定义的领域和机构列表
            initPredefinedFieldsAndInstitutions();
            populateFilterOptions();
            
            // 恢复用户的筛选设置
            preloadedData.selectedFields = savedSelectedFields;
            preloadedData.selectedInstitutions = savedSelectedInstitutions;
        });
}

// 解析CSV行，正确处理引号内的逗号
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            // 处理引号
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                // 双引号转义为单引号
                current += '"';
                i++; // 跳过下一个引号
            } else {
                // 切换引号状态
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // 逗号分隔，但不在引号内
            result.push(current);
            current = '';
        } else {
            // 普通字符
            current += char;
        }
    }
    
    // 添加最后一个字段
    result.push(current);
    
    return result;
}

// Fetch papers
function fetchPapers(date = selectedDate) {
    console.log('Fetching HuggingFace papers...');
    
    // 保存当前的筛选设置，以免在加载数据时被覆盖
    const savedSelectedFields = preloadedData.selectedFields ? new Set(preloadedData.selectedFields) : new Set(['all']);
    const savedSelectedInstitutions = preloadedData.selectedInstitutions ? new Set(preloadedData.selectedInstitutions) : new Set(['all']);
    
    // 构建文件名 - 始终使用日期
    const filename = `huggingface_papers_${date}.csv`;
    
    fetch(filename)
        .then(response => {
            console.log('HuggingFace papers response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(csvText => {
            console.log('Raw HuggingFace CSV text length:', csvText.length);
            
            // 解析 CSV 文本
            let papers = parseHuggingFaceCSV(csvText);
            // 再次修复以确保所有链接都被正确处理
            papers = fixAlphaXivLinks(papers);
            console.log('Processed HuggingFace papers after fix:', papers.length);
            
            preloadedData.papers = papers;
            
            // 使用预定义的领域和机构列表，而不是从CSV提取
            initPredefinedFieldsAndInstitutions();
            
            // 更新筛选器选项
            populateFilterOptions();
            
            // 恢复用户的筛选设置
            preloadedData.selectedFields = savedSelectedFields;
            preloadedData.selectedInstitutions = savedSelectedInstitutions;
            
            updateCache();
            
            // 如果arxiv论文已加载，则合并渲染
            if (preloadedData.arxivPapers) {
                renderCombinedPapers(preloadedData.papers, preloadedData.arxivPapers);
            } else {
                renderPapers(papers);
            }
        })
        .catch(error => {
            console.error('Error fetching HuggingFace papers:', error);
            
            document.getElementById('huggingface-papers-container').innerHTML = 
                '<div class="col-12 text-center mt-4 mb-4"><div class="empty-state"><i class="fas fa-inbox fa-3x mb-3"></i><h4>暂无论文</h4></div></div>';
            
            // 设置空数组而不是null，这样筛选时能正确处理
            preloadedData.papers = [];
            
            // 即使加载论文失败，也初始化预定义的领域和机构列表
            initPredefinedFieldsAndInstitutions();
            populateFilterOptions();
            
            // 恢复用户的筛选设置
            preloadedData.selectedFields = savedSelectedFields;
            preloadedData.selectedInstitutions = savedSelectedInstitutions;
            
            // 如果arxiv数据已加载，渲染arxiv论文
            if (preloadedData.arxivPapers) {
                renderArxivPapers(preloadedData.arxivPapers);
            }
        });
}

// Fetch ArXiv papers
function fetchArxivPapers(date = selectedDate) {
    console.log('Fetching ArXiv papers...');
    
    // 保存当前的筛选设置，以免在加载数据时被覆盖
    const savedSelectedFields = preloadedData.selectedFields ? new Set(preloadedData.selectedFields) : new Set(['all']);
    const savedSelectedInstitutions = preloadedData.selectedInstitutions ? new Set(preloadedData.selectedInstitutions) : new Set(['all']);
    
    // 构建文件名 - 始终使用日期
    const filename = `arxiv_papers_${date}.csv`;
    
    fetch(filename)
        .then(response => {
            console.log('ArXiv papers response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(csvText => {
            console.log('Raw ArXiv CSV text length:', csvText.length);
            
            // 解析 CSV 文本
            let papers = parseArxivCSV(csvText);
            // 再次修复以确保所有链接都被正确处理
            papers = fixAlphaXivLinks(papers);
            console.log('Processed ArXiv papers after fix:', papers.length);
            
            preloadedData.arxivPapers = papers;
            
            // 使用预定义的领域和机构列表，而不是从CSV提取
            initPredefinedFieldsAndInstitutions();
            
            // 更新筛选器选项
            populateFilterOptions();
            
            // 恢复用户的筛选设置
            preloadedData.selectedFields = savedSelectedFields;
            preloadedData.selectedInstitutions = savedSelectedInstitutions;
            
            updateCache();
            
            // 如果Huggingface论文已加载，则合并渲染
            if (preloadedData.papers) {
                renderCombinedPapers(preloadedData.papers, preloadedData.arxivPapers);
            } else {
                renderArxivPapers(papers);
            }
        })
        .catch(error => {
            console.error('Error fetching ArXiv papers:', error);
            
            // 设置空数组而不是null，这样筛选时能正确处理
            preloadedData.arxivPapers = [];
            
            // 即使加载论文失败，也初始化预定义的领域和机构列表
            initPredefinedFieldsAndInstitutions();
            populateFilterOptions();
            
            // 恢复用户的筛选设置
            preloadedData.selectedFields = savedSelectedFields;
            preloadedData.selectedInstitutions = savedSelectedInstitutions;
            
            // 如果HuggingFace论文已加载，则只渲染HuggingFace论文
            if (preloadedData.papers) {
                renderPapers(preloadedData.papers);
            }
        });
}

// 解析 Arxiv CSV 文件
function parseArxivCSV(csvText) {
    // 标准化换行符
    csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    const lines = csvText.split('\n');
    console.log('Arxiv CSV lines count:', lines.length);
    
    // 确保至少有标题行
    if (lines.length < 1) {
        throw new Error('CSV file is empty or invalid');
    }
    
    // 解析标题行
    let headerLine = '';
    let currentIndex = 0;
    let inQuotes = false;
    
    // 找到完整的标题行
    while (currentIndex < lines.length) {
        const line = lines[currentIndex];
        headerLine += line;
        
        // 检查是否在引号内
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                inQuotes = !inQuotes;
            }
        }
        
        // 如果不在引号内，说明标题行已经完整
        if (!inQuotes) {
            break;
        }
        
        headerLine += '\n';
        currentIndex++;
    }
    
    const headers = parseCSVRow(headerLine);
    console.log('Arxiv CSV headers:', headers);
    
    // 解析数据行
    const papers = [];
    let currentRow = '';
    inQuotes = false;
    
    for (let i = currentIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '' && !inQuotes) continue; // 跳过空行，但不跳过引号内的空行
        
        currentRow += (currentRow ? '\n' : '') + line;
        
        // 检查是否在引号内
        for (let j = 0; j < line.length; j++) {
            if (line[j] === '"') {
                inQuotes = !inQuotes;
            }
        }
        
        // 如果不在引号内，说明一行数据已经完整
        if (!inQuotes) {
            const values = parseCSVRow(currentRow);
            
            if (values.length > 1) { // 确保不是空行
                const paper = {};
                
                // 将值映射到对应的字段
                headers.forEach((header, index) => {
                    if (index < values.length) {
                        paper[header] = values[index];
                    } else {
                        paper[header] = '';
                    }
                });
                
                // 修正 AlphaXiv 链接：将 arxiv 替换为 alphaxiv
                if (paper['AlphaXiv链接'] && paper['AlphaXiv链接'].includes('arxiv')) {
                    paper['AlphaXiv链接'] = paper['AlphaXiv链接'].replace(/arxiv/g, 'alphaxiv');
                    console.log('Fixed AlphaXiv link:', paper['AlphaXiv链接']);
                }
                
                papers.push(paper);
            }
            
            currentRow = '';
        }
    }
    
    return papers;
}

// 解析CSV行，正确处理引号内的逗号和换行符
function parseCSVRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            // 处理引号
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                // 双引号转义为单引号
                current += '"';
                i++; // 跳过下一个引号
            } else {
                // 切换引号状态
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // 逗号分隔，但不在引号内
            result.push(current);
            current = '';
        } else {
            // 普通字符
            current += char;
        }
    }
    
    // 添加最后一个字段
    result.push(current);
    
    // 清理每个字段，移除前后引号和多余空格
    return result.map(field => {
        // 移除前后引号
        if (field.startsWith('"') && field.endsWith('"')) {
            field = field.substring(1, field.length - 1);
        }
        return field.trim();
        });
}

// Render all data
function renderData() {
    if (preloadedData.wechatArticles) {
        renderWechatArticles(preloadedData.wechatArticles);
    }
    
    if (preloadedData.papers && preloadedData.arxivPapers) {
        // 合并两种论文数据并按点赞数排序
        renderCombinedPapers();
    } else {
        // 如果其中一种数据不可用，单独渲染
    if (preloadedData.papers) {
        renderPapers();
        }
        
        if (preloadedData.arxivPapers) {
            renderArxivPapers();
        }
    }
}

// Render WeChat articles
function renderWechatArticles(articles) {
    const container = document.getElementById('wechat-articles-container');
    const template = document.getElementById('article-template');
    
    if (!container || !template) {
        return;
    }
    
    // 清空之前的内容
    container.innerHTML = '';
    
    if (!articles || articles.length === 0) {
        container.innerHTML = '<div class="col-12 text-center mt-4 mb-4"><div class="empty-state"><i class="fab fa-weixin fa-3x mb-3"></i><h4>暂无微信公众号文章</h4></div></div>';
        
        // 触发自定义事件，通知文章已加载完成
        const wechatLoadedEvent = new CustomEvent('wechat_content_loaded', { 
            detail: { 
                articleCount: 0,
                timestamp: new Date().getTime(),
                attempt: 1
            } 
        });
        document.dispatchEvent(wechatLoadedEvent);
        return;
    }
    
    // 遍历文章数据
    articles.forEach((article, index) => {
        // 克隆模板
        const articleElement = template.content.cloneNode(true).querySelector('.col-12');
        
        // 设置文章数据
        const titleElement = articleElement.querySelector('.article-title');
        if (titleElement) {
            // 处理标题中可能存在的换行符，并在中英文之间添加空格
            const title = article.report_title || article.title || '无标题';
            titleElement.textContent = addSpaceBetweenCnAndEn(title);
            titleElement.href = article.url || '#';
            titleElement.target = "_blank"; // 在新标签页中打开
            titleElement.style.color = '#0a2d6e';
        }
        
        // 设置原标题
        const originalTitleElement = articleElement.querySelector('.original-title');
        if (originalTitleElement && article.title && article.report_title && article.title !== article.report_title) {
            // 在中英文之间添加空格
            originalTitleElement.textContent = addSpaceBetweenCnAndEn(article.title);
        }
        
        // 设置公众号来源
        const sourceElement = articleElement.querySelector('.article-source');
        if (sourceElement && article.source) {
            sourceElement.textContent = article.source;
        }
        
        // 设置领域分类
        const fieldElement = articleElement.querySelector('.article-field');
        if (fieldElement && article.field) {
            fieldElement.textContent = article.field;
        }
        
        // 设置机构标签（支持多个机构）
        const institutionTagsContainer = articleElement.querySelector('.institution-tags');
        if (institutionTagsContainer && article.institution) {
            // 分割机构名称（按逗号分隔）
            const institutions = article.institution.split(',').map(inst => inst.trim()).filter(inst => inst && inst !== 'Other');
            
            // 为每个机构创建标签
            institutions.forEach(institution => {
                const tagElement = document.createElement('span');
                tagElement.className = 'institution-tag';
                tagElement.textContent = institution;
                institutionTagsContainer.appendChild(tagElement);
            });
        }
        
        // 添加行业大佬标签
        if (article.industry_leader && article.industry_leader.trim() !== '' && article.industry_leader.toLowerCase() !== 'none') {
            const tagContainer = articleElement.querySelector('.tag-container');
            if (tagContainer) {
                // 分割行业大佬名称（按逗号分隔）
                const leaders = article.industry_leader.split(',').map(leader => leader.trim()).filter(leader => 
                    leader && leader.toLowerCase() !== 'none'
                );
                
                // 只显示前三个行业大佬
                const displayLeaders = leaders.slice(0, 3);
                
                // 为每个行业大佬创建标签
                displayLeaders.forEach(leader => {
                    const leaderTag = document.createElement('span');
                    leaderTag.className = 'leader-tag';
                    leaderTag.textContent = leader;
                    tagContainer.appendChild(leaderTag);
                });
            }
        }
        
        // 设置摘要预览
        const summaryTextElement = articleElement.querySelector('.summary-text');
        const summaryPreviewContainer = articleElement.querySelector('.summary-preview');
        
        if (summaryTextElement && article.summary) {
            // 使用固定字数限制，不再尝试自适应
            // 移动设备显示更少字符
            const isMobile = window.innerWidth < 768;
            const maxLength = isMobile ? 40 : 60;
            
            // 处理摘要中的换行符，并在中英文之间添加空格
            const cleanedSummary = addSpaceBetweenCnAndEn(article.summary.replace(/\n/g, ' ').trim());
            
            if (cleanedSummary.length > maxLength) {
                summaryTextElement.textContent = cleanedSummary.substring(0, maxLength) + '...';
            } else {
                summaryTextElement.textContent = cleanedSummary;
            }
            
            // 确保预览容器显示
            if (summaryPreviewContainer) {
                summaryPreviewContainer.style.display = 'flex';
            }
        } else if (summaryTextElement) {
            summaryTextElement.textContent = '无摘要';
        }
        
        // 设置完整摘要
        const summaryContentElement = articleElement.querySelector('.summary-content');
        if (summaryContentElement) {
            // 在中英文之间添加空格
            summaryContentElement.textContent = article.summary ? addSpaceBetweenCnAndEn(article.summary.replace(/\n/g, ' ').trim()) : '无摘要';
        }
        
        // 添加展开摘要按钮事件
        const toggleButton = articleElement.querySelector('.toggle-summary-btn');
        const summaryContainer = articleElement.querySelector('.summary-container');
        
        if (toggleButton && summaryContainer && summaryPreviewContainer) {
            toggleButton.addEventListener('click', function() {
                // 展开摘要：隐藏预览，显示完整内容
                summaryContainer.style.display = 'block';
                summaryPreviewContainer.style.display = 'none';
            });
        }
        
        // 添加收起摘要按钮事件
        const collapseButton = articleElement.querySelector('.collapse-summary-btn');
        if (collapseButton && summaryContainer && summaryPreviewContainer) {
            collapseButton.addEventListener('click', function() {
                // 收起摘要：显示预览，隐藏完整内容
                summaryContainer.style.display = 'none';
                summaryPreviewContainer.style.display = 'flex';
            });
        }
        
        // 添加到容器
        container.appendChild(articleElement);
        
        // 检查是否是最后一个文章，触发加载完成事件
        if (index === articles.length - 1) {
            // 多次触发加载完成事件，确保能够正确定位（每隔500ms触发一次，共触发3次）
            for (let attempt = 1; attempt <= 3; attempt++) {
                setTimeout(() => {
                    console.log(`微信文章加载完成，触发自定义事件 (尝试 ${attempt}/3)`);
                    const wechatLoadedEvent = new CustomEvent('wechat_content_loaded', { 
                        detail: { 
                            articleCount: articles.length,
                            containerHeight: container.offsetHeight,
                            containerTop: document.getElementById('wechat')?.getBoundingClientRect().top + window.scrollY,
                            timestamp: new Date().getTime(),
                            attempt: attempt
                        } 
                    });
                    document.dispatchEvent(wechatLoadedEvent);
                }, attempt * 500); // 500ms, 1000ms, 1500ms 后触发
            }
        }
    });
}

// 合并并渲染所有论文
function renderCombinedPapers(filteredPapers, filteredArxivPapers) {
    const container = document.getElementById('huggingface-papers-container');
    const template = document.getElementById('article-template');
    
    if (!container || !template) {
        return;
    }
    
    // 清空容器
    container.innerHTML = '';
    
    // 使用传入的筛选后的论文，如果没有则使用所有论文
    const papersToRender = filteredPapers || preloadedData.papers || [];
    const arxivPapersToRender = filteredArxivPapers || preloadedData.arxivPapers || [];
    
    // 使用Map来存储不重复的论文，以PDF链接为键
    const uniquePapersMap = new Map();
    
    // 首先添加HuggingFace论文
    papersToRender.forEach(paper => {
        const pdfLink = paper['PDF链接'] || '';
        if (pdfLink) {
            uniquePapersMap.set(pdfLink, paper);
        } else {
            // 如果没有PDF链接，使用标题作为键
            const title = paper['标题'] || '';
            if (title) {
                uniquePapersMap.set('title:' + title, paper);
            }
        }
    });
    
    // 然后添加Arxiv论文，如果PDF链接已存在则跳过
    arxivPapersToRender.forEach(paper => {
        const pdfLink = paper['PDF链接'] || '';
        if (pdfLink && !uniquePapersMap.has(pdfLink)) {
            uniquePapersMap.set(pdfLink, paper);
        } else if (!pdfLink) {
            // 如果没有PDF链接，使用标题作为键
            const title = paper['标题'] || '';
            if (title && !uniquePapersMap.has('title:' + title)) {
                uniquePapersMap.set('title:' + title, paper);
            }
        }
    });
    
    // 将Map转换为数组
    const combinedPapers = Array.from(uniquePapersMap.values());
    
    if (combinedPapers.length === 0) {
        // 检查是否是由于筛选导致的空结果
        const isFiltering = !preloadedData.selectedFields.has('all') || !preloadedData.selectedInstitutions.has('all');
        const hasOriginalPapers = (preloadedData.papers && preloadedData.papers.length > 0) || 
                                 (preloadedData.arxivPapers && preloadedData.arxivPapers.length > 0);
        
        if (isFiltering && hasOriginalPapers) {
            // 筛选导致的空结果
            container.innerHTML = '<div class="col-12 text-center mt-4 mb-4"><div class="empty-state"><i class="fas fa-filter fa-3x mb-3"></i><h4>没有符合要求的论文</h4></div></div>';
        } else {
            // 日期筛选或数据本身为空
            container.innerHTML = '<div class="col-12 text-center mt-4 mb-4"><div class="empty-state"><i class="fas fa-file-alt fa-3x mb-3"></i><h4>暂无论文</h4></div></div>';
        }
        return;
    }
    
    // 按点赞数排序（降序）
    combinedPapers.sort((a, b) => {
        const upvotesA = parseInt(a['Upvote数'] || a['点赞数'] || 0);
        const upvotesB = parseInt(b['Upvote数'] || b['点赞数'] || 0);
        return upvotesB - upvotesA;
    });
    
    console.log(`渲染合并论文: 去重后总计 ${combinedPapers.length}篇`);
    
    // 遍历论文数据
    combinedPapers.forEach(paper => {
        // 克隆模板
        const articleElement = template.content.cloneNode(true).querySelector('.col-12');
        
        // 设置标题
        const titleElement = articleElement.querySelector('.article-title');
        if (titleElement) {
            // 处理标题中可能存在的换行符，并在中英文之间添加空格
            const title = paper['标题'] ? paper['标题'].replace(/\n/g, ' ').trim() : '无标题';
            titleElement.textContent = addSpaceBetweenCnAndEn(title);
            titleElement.href = paper['PDF链接'] || '#';
            titleElement.target = "_blank"; // 在新标签页中打开
            titleElement.style.color = '#0a2d6e';
        }
        
        // 设置中文标题
        const originalTitleElement = articleElement.querySelector('.original-title');
        if (originalTitleElement) {
            if (paper['中文标题']) {
                // 创建链接元素
                const linkElement = document.createElement('a');
                
                // 根据来源选择合适的链接
                let link = paper['论文链接'] || paper['AlphaXiv链接'] || paper['PDF链接'] || '#';
                // 最后一道防线：确保 AlphaXiv 链接使用的是 alphaxiv 而不是 arxiv
                if (link && link.includes('arxiv')) {
                    link = link.replace(/arxiv/g, 'alphaxiv');
                    console.log('Final fix for AlphaXiv link in renderCombinedPapers:', link);
                }
                linkElement.href = link;
                
                // 在新标签页中打开链接
                linkElement.target = "_blank";
                // 处理中文标题中可能存在的换行符，并在中英文之间添加空格
                linkElement.textContent = addSpaceBetweenCnAndEn(paper['中文标题'].replace(/\n/g, ' ').trim());
                linkElement.style.color = '#0a2d6e';
                linkElement.style.textDecoration = 'none';
                // 添加链接到标题元素
                originalTitleElement.innerHTML = '';
                originalTitleElement.appendChild(linkElement);
            } else {
                originalTitleElement.style.display = 'none';
            }
        }
        
        // 不显示来源标签
        const sourceElement = articleElement.querySelector('.article-source');
        if (sourceElement) {
            sourceElement.style.display = 'none';
        }
        
        // 设置领域标签
        const fieldElement = articleElement.querySelector('.article-field');
        if (fieldElement && paper['领域分类']) {
            fieldElement.textContent = paper['领域分类'];
        } else if (fieldElement) {
            fieldElement.style.display = 'none';
        }
        
        // 设置机构标签
        const institutionTagsContainer = articleElement.querySelector('.institution-tags');
        if (institutionTagsContainer && paper['研究机构']) {
            // 分割机构名称（按逗号分隔）
            const institutions = paper['研究机构'].split(',').map(inst => inst.trim()).filter(inst => inst && inst !== 'Other');
            
            // 为每个机构创建标签
            institutions.forEach(institution => {
                const tagElement = document.createElement('span');
                tagElement.className = 'institution-tag';
                tagElement.textContent = institution;
                institutionTagsContainer.appendChild(tagElement);
            });
        }
        
        // 添加点赞数标签
        const upvoteValue = paper['Upvote数'] || paper['点赞数'];
        if (upvoteValue) {
            const upvoteTag = document.createElement('span');
            upvoteTag.className = 'upvote-tag';
            upvoteTag.innerHTML = `<i class="fas fa-thumbs-up"></i> ${upvoteValue}`;
            
            // 将点赞标签添加到标签容器中
            const tagContainer = articleElement.querySelector('.tag-container');
            if (tagContainer) {
                tagContainer.appendChild(upvoteTag);
            }
        }
        
        // 设置摘要预览
        const summaryTextElement = articleElement.querySelector('.summary-text');
        const summaryPreviewContainer = articleElement.querySelector('.summary-preview');
        
        if (summaryTextElement && paper['简明摘要']) {
            // 使用固定字数限制
            const isMobile = window.innerWidth < 768;
            const maxLength = isMobile ? 40 : 60;
            
            // 处理简明摘要中可能存在的换行符，并在中英文之间添加空格
            const cleanedSummary = addSpaceBetweenCnAndEn(paper['简明摘要'].replace(/\n/g, ' ').trim());
            
            if (cleanedSummary.length > maxLength) {
                summaryTextElement.textContent = cleanedSummary.substring(0, maxLength) + '...';
            } else {
                summaryTextElement.textContent = cleanedSummary;
            }
            
            // 确保预览容器显示
            if (summaryPreviewContainer) {
                summaryPreviewContainer.style.display = 'flex';
            }
        } else if (summaryTextElement) {
            summaryTextElement.textContent = '无摘要';
        }
        
        // 设置完整摘要
        const summaryContentElement = articleElement.querySelector('.summary-content');
        if (summaryContentElement) {
            // 处理简明摘要中可能存在的换行符，并在中英文之间添加空格
            summaryContentElement.textContent = paper['简明摘要'] ? addSpaceBetweenCnAndEn(paper['简明摘要'].replace(/\n/g, ' ').trim()) : '无摘要';
        }
        
        // 添加展开摘要按钮事件
        const toggleButton = articleElement.querySelector('.toggle-summary-btn');
        const summaryContainer = articleElement.querySelector('.summary-container');
        
        if (toggleButton && summaryContainer && summaryPreviewContainer) {
            toggleButton.addEventListener('click', function() {
                // 展开摘要：隐藏预览，显示完整内容
                summaryContainer.style.display = 'block';
                summaryPreviewContainer.style.display = 'none';
            });
        }
        
        // 添加收起摘要按钮事件
        const collapseButton = articleElement.querySelector('.collapse-summary-btn');
        if (collapseButton && summaryContainer && summaryPreviewContainer) {
            collapseButton.addEventListener('click', function() {
                // 收起摘要：显示预览，隐藏完整内容
                summaryContainer.style.display = 'none';
                summaryPreviewContainer.style.display = 'flex';
            });
        }
        
        // 添加到容器
        container.appendChild(articleElement);
    });
}

// Format date
function formatDate(dateString) {
    if (!dateString) return '未知日期';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

// 添加空格函数：在中英文之间添加空格
function addSpaceBetweenCnAndEn(text) {
    if (!text) return '';
    
    // 使用正则表达式匹配中英文边界并添加空格
    // 匹配中文后跟英文的情况
    let result = text.replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2');
    
    // 匹配英文后跟中文的情况
    result = result.replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
    
    return result;
}

// Cache management
function updateCache() {
    try {
        localStorage.setItem(CACHE_KEYS.WECHAT_ARTICLES, JSON.stringify(preloadedData.wechatArticles));
        localStorage.setItem(CACHE_KEYS.PAPERS, JSON.stringify(preloadedData.papers));
        localStorage.setItem(CACHE_KEYS.ARXIV_PAPERS, JSON.stringify(preloadedData.arxivPapers));
        localStorage.setItem(CACHE_KEYS.LAST_UPDATED, Date.now().toString());
    } catch (e) {
        console.warn('Failed to update cache:', e);
    }
}

function getCachedData() {
    try {
        const lastUpdated = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);
        if (!lastUpdated || Date.now() - parseInt(lastUpdated) > CACHE_EXPIRATION) {
            return null;
        }
        
        const cachedData = {
            wechatArticles: JSON.parse(localStorage.getItem(CACHE_KEYS.WECHAT_ARTICLES)),
            papers: JSON.parse(localStorage.getItem(CACHE_KEYS.PAPERS)),
            arxivPapers: JSON.parse(localStorage.getItem(CACHE_KEYS.ARXIV_PAPERS)),
            fields: new Set(),
            institutions: new Set(),
            selectedFields: new Set(['LLM']),  // 默认选中LLM领域
            selectedInstitutions: new Set(['all'])
        };
        
        // 确保所有必要的数据都存在
        if (!cachedData.wechatArticles || !cachedData.papers || !cachedData.arxivPapers) {
            console.warn('Cached data incomplete, fetching fresh data');
            return null;
        }
        
        return cachedData;
    } catch (e) {
        console.warn('Failed to get cached data:', e);
        return null;
    }
}

function clearExpiredCache() {
    try {
        const lastUpdated = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);
        if (!lastUpdated || Date.now() - parseInt(lastUpdated) > CACHE_EXPIRATION) {
            localStorage.removeItem(CACHE_KEYS.WECHAT_ARTICLES);
            localStorage.removeItem(CACHE_KEYS.PAPERS);
            localStorage.removeItem(CACHE_KEYS.ARXIV_PAPERS);
            localStorage.removeItem(CACHE_KEYS.LAST_UPDATED);
        }
    } catch (e) {
        console.warn('Failed to clear expired cache:', e);
    }
}

// 初始化筛选器
function initFilters() {
    // 获取筛选器元素
    const fieldFilterContainer = document.getElementById('field-filter-container');
    const institutionFilterContainer = document.getElementById('institution-filter-container');
    const resetFiltersBtn = document.getElementById('reset-filters');
    
    // 初始化多选下拉框
    if (fieldFilterContainer) {
        initMultiSelect(fieldFilterContainer, 'field');
    }
    
    if (institutionFilterContainer) {
        initMultiSelect(institutionFilterContainer, 'institution');
    }
    
    // 重置筛选按钮
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', function() {
            resetFilters();
        });
    }
}

// 初始化多选下拉框
function initMultiSelect(container, type) {
    const selectedOptions = container.querySelector('.selected-options');
    const optionsDropdown = container.querySelector('.options-dropdown');
    
    // 点击选择区域显示/隐藏下拉选项
    selectedOptions.addEventListener('click', function(e) {
        e.stopPropagation();
        
        // 关闭其他打开的下拉框
        document.querySelectorAll('.multi-select-container.active').forEach(el => {
            if (el !== container) {
                el.classList.remove('active');
            }
        });
        
        // 切换当前下拉框状态
        container.classList.toggle('active');
    });
    
    // 点击选项时的处理
    optionsDropdown.addEventListener('click', function(e) {
        e.stopPropagation();
        
        const optionItem = e.target.closest('.option-item');
        if (!optionItem) return;
        
        const checkbox = optionItem.querySelector('input[type="checkbox"]');
        const value = optionItem.getAttribute('data-value');
        
        // 如果点击的是复选框标签，不需要额外处理，因为复选框状态会自动改变
        if (e.target.tagName === 'LABEL') return;
        
        // 如果点击的不是复选框本身，则手动切换复选框状态
        if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
        }
        
        // 处理选项选择逻辑
        handleOptionSelection(type, value, checkbox.checked);
    });
    
    // 点击文档其他地方关闭下拉框
    document.addEventListener('click', function() {
        container.classList.remove('active');
    });
}

// 处理选项选择逻辑
function handleOptionSelection(type, value, isSelected) {
    const isAllOption = value === 'all';
    const selectedSet = type === 'field' ? preloadedData.selectedFields : preloadedData.selectedInstitutions;
    const optionsContainer = document.getElementById(`${type}-options`);
    const selectedContainer = document.getElementById(`selected-${type}s`);
    
    // 处理"全部"选项的特殊逻辑
    if (isAllOption) {
        if (isSelected) {
            // 选中"全部"选项时，取消选中其他所有选项
            selectedSet.clear();
            selectedSet.add('all');
            
            // 更新UI：取消选中其他选项的复选框
            optionsContainer.querySelectorAll('.option-item:not(.select-all)').forEach(item => {
                item.querySelector('input[type="checkbox"]').checked = false;
                item.classList.remove('selected');
            });
            
            // 选中"全部"选项的复选框
            const allOption = optionsContainer.querySelector('.select-all');
            if (allOption) {
                allOption.querySelector('input[type="checkbox"]').checked = true;
                allOption.classList.add('selected');
            }
        } else {
            // 不允许取消选中"全部"选项，如果没有其他选项被选中
            if (selectedSet.size <= 1) {
                const allCheckbox = optionsContainer.querySelector('.select-all input[type="checkbox"]');
                if (allCheckbox) {
                    allCheckbox.checked = true;
                }
                return;
            }
            
            // 取消选中"全部"选项
            selectedSet.delete('all');
        }
    } else {
        // 处理普通选项
        if (isSelected) {
            // 选中普通选项时，如果"全部"已选中，则取消选中"全部"
            if (selectedSet.has('all')) {
                selectedSet.delete('all');
                const allOption = optionsContainer.querySelector('.select-all');
                if (allOption) {
                    allOption.querySelector('input[type="checkbox"]').checked = false;
                    allOption.classList.remove('selected');
                }
            }
            
            // 添加选中的选项
            selectedSet.add(value);
            
            // 更新UI：选中当前选项
            const currentOption = optionsContainer.querySelector(`.option-item[data-value="${value}"]`);
            if (currentOption) {
                currentOption.classList.add('selected');
            }
        } else {
            // 取消选中普通选项
            selectedSet.delete(value);
            
            // 更新UI：取消选中当前选项
            const currentOption = optionsContainer.querySelector(`.option-item[data-value="${value}"]`);
            if (currentOption) {
                currentOption.classList.remove('selected');
            }
            
            // 如果没有选中任何选项，则自动选中"全部"
            if (selectedSet.size === 0) {
                selectedSet.add('all');
                const allOption = optionsContainer.querySelector('.select-all');
                if (allOption) {
                    allOption.querySelector('input[type="checkbox"]').checked = true;
                    allOption.classList.add('selected');
                }
            }
        }
    }
    
    // 更新已选择的选项显示
    updateSelectedDisplay(type);
    
    // 应用筛选
    applyFilters();
}

// 更新已选择的选项显示
function updateSelectedDisplay(type) {
    const selectedSet = type === 'field' ? preloadedData.selectedFields : preloadedData.selectedInstitutions;
    const selectedContainer = document.getElementById(`selected-${type}s`);
    
    // 清空当前显示
    selectedContainer.innerHTML = '';
    
    // 如果选中了"全部"选项
    if (selectedSet.has('all')) {
        const allSpan = document.createElement('span');
        allSpan.className = 'selected-all';
        allSpan.textContent = type === 'field' ? '全部领域' : '全部机构';
        selectedContainer.appendChild(allSpan);
        return;
    }
    
    // 显示已选择的选项
    selectedSet.forEach(value => {
        const optionSpan = document.createElement('span');
        optionSpan.className = 'selected-option';
        optionSpan.textContent = value;
        
        // 添加删除按钮
        const removeBtn = document.createElement('i');
        removeBtn.className = 'fas fa-times remove-option';
        removeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // 取消选中该选项
            const optionsContainer = document.getElementById(`${type}-options`);
            const optionItem = optionsContainer.querySelector(`.option-item[data-value="${value}"]`);
            if (optionItem) {
                const checkbox = optionItem.querySelector('input[type="checkbox"]');
                checkbox.checked = false;
                handleOptionSelection(type, value, false);
            }
        });
        
        optionSpan.appendChild(removeBtn);
        selectedContainer.appendChild(optionSpan);
    });
}

// 重置筛选器
function resetFilters() {
    // 重置选中的领域和机构
    preloadedData.selectedFields.clear();
    preloadedData.selectedFields.add('LLM');  // 默认选中LLM领域
    
    preloadedData.selectedInstitutions.clear();
    preloadedData.selectedInstitutions.add('all');
    
    // 更新UI
    const fieldOptions = document.getElementById('field-options');
    const institutionOptions = document.getElementById('institution-options');
    
    // 重置领域选项
    if (fieldOptions) {
        fieldOptions.querySelectorAll('.option-item').forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const isAllOption = item.classList.contains('select-all');
            const isLLMOption = item.getAttribute('data-value') === 'LLM';
            
            // 全部选项不选中，LLM选项选中
            checkbox.checked = isLLMOption;
            item.classList.toggle('selected', isLLMOption);
        });
    }
    
    // 重置机构选项
    if (institutionOptions) {
        institutionOptions.querySelectorAll('.option-item').forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const isAllOption = item.classList.contains('select-all');
            
            checkbox.checked = isAllOption;
            item.classList.toggle('selected', isAllOption);
        });
    }
    
    // 更新已选择的选项显示
    updateSelectedDisplay('field');
    updateSelectedDisplay('institution');
    
    // 应用筛选
    applyFilters();
}

// 应用筛选
function applyFilters() {
    // 筛选微信文章
    if (preloadedData.wechatArticles) {
        // 获取筛选后的文章
        const filteredWechatArticles = preloadedData.wechatArticles.filter(article => {
            // 检查领域筛选
            let fieldMatch = preloadedData.selectedFields.has('all');
            
            if (!fieldMatch && article.field) {
                fieldMatch = preloadedData.selectedFields.has(article.field);
            }
            
            // 检查机构筛选
            let institutionMatch = preloadedData.selectedInstitutions.has('all');
            
            if (!institutionMatch && article.institution) {
                const institutions = article.institution.split(',').map(inst => inst.trim());
                institutionMatch = institutions.some(inst => preloadedData.selectedInstitutions.has(inst));
            }
            
            return fieldMatch && institutionMatch;
        });
        
        // 渲染筛选后的微信文章
        renderWechatArticles(filteredWechatArticles);
    }
    
    // 筛选论文
    let filteredPapers = [];
    if (preloadedData.papers) {
        // 获取筛选后的论文
        filteredPapers = preloadedData.papers.filter(paper => {
            // 检查领域筛选
            let fieldMatch = preloadedData.selectedFields.has('all');
            
            if (!fieldMatch && paper['领域分类']) {
                fieldMatch = preloadedData.selectedFields.has(paper['领域分类']);
            }
            
            // 检查机构筛选
            let institutionMatch = preloadedData.selectedInstitutions.has('all');
            
            if (!institutionMatch && paper['研究机构']) {
                const institutions = paper['研究机构'].split(',').map(inst => inst.trim());
                institutionMatch = institutions.some(inst => preloadedData.selectedInstitutions.has(inst));
            }
            
            return fieldMatch && institutionMatch;
        });
    }
    
    // 筛选arxiv论文
    let filteredArxivPapers = [];
    if (preloadedData.arxivPapers) {
        // 获取筛选后的arxiv论文
        filteredArxivPapers = preloadedData.arxivPapers.filter(paper => {
            // 检查领域筛选
            let fieldMatch = preloadedData.selectedFields.has('all');
            
            if (!fieldMatch && paper['领域分类']) {
                fieldMatch = preloadedData.selectedFields.has(paper['领域分类']);
            }
            
            // 检查机构筛选
            let institutionMatch = preloadedData.selectedInstitutions.has('all');
            
            if (!institutionMatch && paper['研究机构']) {
                const institutions = paper['研究机构'].split(',').map(inst => inst.trim());
                institutionMatch = institutions.some(inst => preloadedData.selectedInstitutions.has(inst));
            }
            
            return fieldMatch && institutionMatch;
        });
    }
    
    // 合并渲染筛选后的论文
    if (preloadedData.papers && preloadedData.arxivPapers) {
        renderCombinedPapers(filteredPapers, filteredArxivPapers);
    } else {
        // 如果其中一种数据不可用，单独渲染
        if (preloadedData.papers) {
            renderPapers(filteredPapers);
        }
        
        if (preloadedData.arxivPapers) {
            renderArxivPapers(filteredArxivPapers);
        }
    }
    
    // 更新筛选信息
    updateFilterInfo();
}

// 更新筛选信息
function updateFilterInfo() {
    const filterInfo = document.getElementById('filter-info');
    if (!filterInfo) return;
    
    const totalWechatCount = preloadedData.wechatArticles ? preloadedData.wechatArticles.length : 0;
    const totalPapersCount = preloadedData.papers ? preloadedData.papers.length : 0;
    const totalArxivCount = preloadedData.arxivPapers ? preloadedData.arxivPapers.length : 0;
    
    // 计算论文总数（合并HuggingFace和Arxiv）
    const totalAllPapersCount = totalPapersCount + totalArxivCount;
    
    // 计算筛选后的数量
    const filteredWechatCount = preloadedData.wechatArticles ? preloadedData.wechatArticles.filter(article => {
        // 检查领域筛选
        let fieldMatch = preloadedData.selectedFields.has('all');
        
        if (!fieldMatch && article.field) {
            fieldMatch = preloadedData.selectedFields.has(article.field);
        }
        
        // 检查机构筛选
        let institutionMatch = preloadedData.selectedInstitutions.has('all');
        
        if (!institutionMatch && article.institution) {
            const institutions = article.institution.split(',').map(inst => inst.trim());
            institutionMatch = institutions.some(inst => preloadedData.selectedInstitutions.has(inst));
        }
        
        return fieldMatch && institutionMatch;
    }).length : 0;
    
    const filteredPapersCount = preloadedData.papers ? preloadedData.papers.filter(paper => {
        // 检查领域筛选
        let fieldMatch = preloadedData.selectedFields.has('all');
        
        if (!fieldMatch && paper['领域分类']) {
            fieldMatch = preloadedData.selectedFields.has(paper['领域分类']);
        }
        
        // 检查机构筛选
        let institutionMatch = preloadedData.selectedInstitutions.has('all');
        
        if (!institutionMatch && paper['研究机构']) {
            const institutions = paper['研究机构'].split(',').map(inst => inst.trim());
            institutionMatch = institutions.some(inst => preloadedData.selectedInstitutions.has(inst));
        }
        
        return fieldMatch && institutionMatch;
    }).length : 0;
    
    const filteredArxivCount = preloadedData.arxivPapers ? preloadedData.arxivPapers.filter(paper => {
        // 检查领域筛选
        let fieldMatch = preloadedData.selectedFields.has('all');
        
        if (!fieldMatch && paper['领域分类']) {
            fieldMatch = preloadedData.selectedFields.has(paper['领域分类']);
        }
        
        // 检查机构筛选
        let institutionMatch = preloadedData.selectedInstitutions.has('all');
        
        if (!institutionMatch && paper['研究机构']) {
            const institutions = paper['研究机构'].split(',').map(inst => inst.trim());
            institutionMatch = institutions.some(inst => preloadedData.selectedInstitutions.has(inst));
        }
        
        return fieldMatch && institutionMatch;
    }).length : 0;
    
    // 合并HuggingFace和Arxiv的筛选后计数
    const filteredAllPapersCount = filteredPapersCount + filteredArxivCount;
    
    const totalFilteredCount = filteredWechatCount + filteredAllPapersCount;
    const totalCount = totalWechatCount + totalAllPapersCount;
    
    if (preloadedData.selectedFields.has('all') && preloadedData.selectedInstitutions.has('all')) {
        filterInfo.textContent = `显示全部 ${totalCount} 篇内容（${filteredAllPapersCount} 篇论文，${filteredWechatCount} 篇微信推文）`;
    } else {
        let filterText = '筛选条件: ';
        
        if (!preloadedData.selectedFields.has('all')) {
            filterText += `领域: ${Array.from(preloadedData.selectedFields).join(', ')}`;
        }
        
        if (!preloadedData.selectedInstitutions.has('all')) {
            if (!preloadedData.selectedFields.has('all')) {
                filterText += ', ';
            }
            filterText += `机构: ${Array.from(preloadedData.selectedInstitutions).join(', ')}`;
        }
        
        filterInfo.textContent = `${filterText} (${totalFilteredCount}/${totalCount}，${filteredAllPapersCount} 篇论文，${filteredWechatCount} 篇微信文章)`;
    }
}

// 初始化预定义的领域和机构
function initPredefinedFieldsAndInstitutions() {
    // 确保fields和institutions是Set对象
    if (!(preloadedData.fields instanceof Set)) {
        preloadedData.fields = new Set();
    } else {
        preloadedData.fields.clear();
    }
    
    if (!(preloadedData.institutions instanceof Set)) {
        preloadedData.institutions = new Set();
    } else {
        preloadedData.institutions.clear();
    }
    
    // 添加预定义的领域
    PREDEFINED_FIELDS.forEach(field => {
        preloadedData.fields.add(field);
    });
    
    // 添加预定义的机构
    PREDEFINED_INSTITUTIONS.forEach(institution => {
        preloadedData.institutions.add(institution);
    });
    
    console.log('Initialized predefined fields:', Array.from(preloadedData.fields));
    console.log('Initialized predefined institutions:', Array.from(preloadedData.institutions));
}

// 填充筛选器选项
function populateFilterOptions() {
    const fieldOptions = document.getElementById('field-options');
    const institutionOptions = document.getElementById('institution-options');
    
    // 确保fields和institutions是Set对象
    if (!(preloadedData.fields instanceof Set)) {
        preloadedData.fields = new Set();
    }
    
    if (!(preloadedData.institutions instanceof Set)) {
        preloadedData.institutions = new Set();
    }
    
    // 临时保存用户当前的选择，避免被覆盖
    const userSelectedFields = preloadedData.selectedFields ? new Set(preloadedData.selectedFields) : new Set(['all']);
    const userSelectedInstitutions = preloadedData.selectedInstitutions ? new Set(preloadedData.selectedInstitutions) : new Set(['all']);
    
    console.log('Populating filter options');
    console.log('Fields:', Array.from(preloadedData.fields).length);
    console.log('Institutions:', Array.from(preloadedData.institutions).length);
    
    if (fieldOptions) {
        // 清空现有选项（保留"全部"选项）
        const allOption = fieldOptions.querySelector('.select-all');
        fieldOptions.innerHTML = '';
        if (allOption) {
            fieldOptions.appendChild(allOption);
        }
        
        // 使用预定义的顺序添加领域选项，而不是按字母排序
        PREDEFINED_FIELDS.forEach(field => {
            const optionItem = document.createElement('div');
            optionItem.className = 'option-item';
            optionItem.setAttribute('data-value', field);
            
            // 检查该选项是否应被选中
            const isSelected = userSelectedFields.has(field);
            if (isSelected) {
                optionItem.classList.add('selected');
            }
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `field-${field}`;
            checkbox.checked = isSelected;
            
            const label = document.createElement('label');
            label.setAttribute('for', `field-${field}`);
            label.textContent = field;
            
            optionItem.appendChild(checkbox);
            optionItem.appendChild(label);
            
            fieldOptions.appendChild(optionItem);
        });
    }
    
    if (institutionOptions) {
        // 清空现有选项（保留"全部"选项）
        const allOption = institutionOptions.querySelector('.select-all');
        institutionOptions.innerHTML = '';
        if (allOption) {
            institutionOptions.appendChild(allOption);
        }
        
        // 使用预定义的顺序添加机构选项，而不是按字母排序
        PREDEFINED_INSTITUTIONS.forEach(institution => {
            const optionItem = document.createElement('div');
            optionItem.className = 'option-item';
            optionItem.setAttribute('data-value', institution);
            
            // 检查该选项是否应被选中
            const isSelected = userSelectedInstitutions.has(institution);
            if (isSelected) {
                optionItem.classList.add('selected');
            }
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `institution-${institution}`;
            checkbox.checked = isSelected;
            
            const label = document.createElement('label');
            label.setAttribute('for', `institution-${institution}`);
            label.textContent = institution;
            
            optionItem.appendChild(checkbox);
            optionItem.appendChild(label);
            
            institutionOptions.appendChild(optionItem);
        });
    }
    
    // 确保全部选项的复选框状态正确反映
    const fieldAllCheckbox = document.querySelector('#field-all');
    if (fieldAllCheckbox) {
        fieldAllCheckbox.checked = userSelectedFields.has('all');
    }
    
    const institutionAllCheckbox = document.querySelector('#institution-all');
    if (institutionAllCheckbox) {
        institutionAllCheckbox.checked = userSelectedInstitutions.has('all');
    }
    
    // 恢复用户的筛选设置
    preloadedData.selectedFields = userSelectedFields;
    preloadedData.selectedInstitutions = userSelectedInstitutions;
    
    // 更新显示已选择的选项
    updateSelectedDisplay('field');
    updateSelectedDisplay('institution');
}

// 加载HuggingFace论文数据
async function loadHuggingFacePapers() {
    try {
        const response = await fetch('huggingface_papers.csv');
        const data = await response.text();
        
        console.log('HuggingFace CSV 加载成功，长度:', data.length);
        
        // 解析CSV数据
        const papers = parseHuggingFaceCSV(data);
        console.log(`成功解析 ${papers.length} 篇HuggingFace论文`);
        
        // 将解析后的数据存储到preloadedData.papers中
        preloadedData.papers = papers;
        
        // 如果arxiv论文已加载，则合并渲染
        if (preloadedData.arxivPapers) {
            renderCombinedPapers();
        } else {
            renderPapers();
        }
    } catch (error) {
        console.error('加载HuggingFace论文时出错:', error);
        const container = document.getElementById('huggingface-papers-container');
        if (container) {
            container.innerHTML = '<div class="alert alert-danger">加载HuggingFace论文失败: ' + error.message + '</div>';
        }
    }
}

// 完全重写的CSV解析函数，正确处理多行字段
function parseHuggingFaceCSV(csvText) {
    console.log('开始解析HuggingFace CSV，总长度:', csvText.length);
    
    // 预处理：规范化行尾
    csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    let position = 0;
    const length = csvText.length;
    
    // 解析第一行获取表头
    let headerLine = '';
    let inQuotes = false;
    
    while (position < length) {
        const char = csvText[position];
        headerLine += char;
        position++;
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === '\n' && !inQuotes) {
            break; // 找到表头行结束
        }
    }
    
    // 解析表头
    const headers = parseCSVRow(headerLine);
    console.log('解析到的表头:', headers);
    
    // 解析数据行
    const papers = [];
    let currentRow = '';
    inQuotes = false;
    
    while (position < length) {
        const char = csvText[position];
        position++;
        
        // 处理引号
        if (char === '"') {
            inQuotes = !inQuotes;
            currentRow += char;
        } 
        // 如果遇到行尾且不在引号内，或者到达文件末尾，则处理当前行
        else if ((char === '\n' && !inQuotes) || position >= length) {
            if (char === '\n') {
                currentRow += char;
            }
            
            // 跳过空行
            if (currentRow.trim() === '' || currentRow === '\n') {
                currentRow = '';
                continue;
            }
            
            // 解析当前行
            try {
                const values = parseCSVRow(currentRow);
                
                // 确保值的数量与表头匹配
                if (values.length > 0) {
                    // 创建论文对象
                    const paper = {};
                    
                    // 将每个值映射到对应的字段
                    for (let i = 0; i < headers.length; i++) {
                        const header = headers[i] ? headers[i].trim() : `column${i}`;
                        paper[header] = i < values.length ? values[i] : '';
                    }
                    
                    // 修正 AlphaXiv 链接：将 arxiv 替换为 alphaxiv
                    if (paper['AlphaXiv链接'] && paper['AlphaXiv链接'].includes('arxiv')) {
                        paper['AlphaXiv链接'] = paper['AlphaXiv链接'].replace(/arxiv/g, 'alphaxiv');
                        console.log('Fixed AlphaXiv link in HuggingFace data:', paper['AlphaXiv链接']);
                    }
                    
                    papers.push(paper);
                    console.log(`成功解析第${papers.length}篇论文: ${paper['标题'] ? paper['标题'].substring(0, 30) + '...' : '无标题'}`);
                }
            } catch (error) {
                console.error('解析行时出错:', error, '行内容:', currentRow.substring(0, 100) + '...');
            }
            
            currentRow = '';
        } else {
            currentRow += char;
        }
    }
    
    console.log(`CSV解析完成，共解析${papers.length}篇论文`);
    return papers;
}

// 显示HuggingFace论文卡片
function displayHuggingFacePapers(papers) {
    const container = document.getElementById('huggingface-papers-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    papers.forEach(paper => {
        const paperCard = createHuggingFacePaperCard(paper);
        container.appendChild(paperCard);
    });
}

// 创建HuggingFace论文卡片
function createHuggingFacePaperCard(paper) {
    const col = document.createElement('div');
    col.className = 'col-12 mb-4';
    
    const card = document.createElement('div');
    card.className = 'article-card';
    
    // 创建卡片内容
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    // 创建标题行
    const titleRow = document.createElement('div');
    titleRow.className = 'title-row';
    
    // 创建标题区域
    const titleArea = document.createElement('div');
    titleArea.className = 'article-header';
    
    // 创建标题链接 - 使用PDF链接
    const titleLink = document.createElement('a');
    titleLink.href = paper['PDF链接'] || '#'; // 使用PDF链接
    titleLink.target = '_blank';
    titleLink.className = 'article-title';
    titleLink.textContent = paper['标题'] || '无标题';
    
    // 创建中文标题（原标题）
    const originalTitle = document.createElement('div');
    originalTitle.className = 'original-title';
    originalTitle.textContent = paper['中文标题'] || '';
    
    // 将标题和原标题添加到标题区域
    titleArea.appendChild(titleLink);
    if (paper['中文标题']) {
        titleArea.appendChild(originalTitle);
    }
    
    // 创建标签容器
    const tagContainer = document.createElement('div');
    tagContainer.className = 'tag-container';
    
    // 添加领域标签
    if (paper['领域分类']) {
        const fieldTag = document.createElement('span');
        fieldTag.className = 'article-field';
        fieldTag.textContent = paper['领域分类'];
        tagContainer.appendChild(fieldTag);
    }
    
    // 添加研究机构标签（支持多个机构）
    if (paper['研究机构']) {
        // 创建机构标签容器
        const institutionTagsContainer = document.createElement('div');
        institutionTagsContainer.className = 'institution-tags';
        
        // 分割机构名称（按逗号分隔）
        const institutions = paper['研究机构'].split(',').map(inst => inst.trim()).filter(inst => inst && inst !== 'Other');
        
        // 为每个机构创建标签
        institutions.forEach(institution => {
            const tagElement = document.createElement('span');
            tagElement.className = 'institution-tag';
            tagElement.textContent = institution;
            institutionTagsContainer.appendChild(tagElement);
        });
        
        tagContainer.appendChild(institutionTagsContainer);
    }
    
    // 添加Upvote数标签
    if (paper['Upvote数']) {
        const upvoteTag = document.createElement('span');
        upvoteTag.className = 'upvote-tag';
        upvoteTag.innerHTML = `<i class="fas fa-thumbs-up"></i> ${paper['Upvote数']}`;
        tagContainer.appendChild(upvoteTag);
    }
    
    // 将标题区域和标签容器添加到标题行
    titleRow.appendChild(titleArea);
    titleRow.appendChild(tagContainer);
    
    // 创建摘要预览
    const summaryPreview = document.createElement('div');
    summaryPreview.className = 'summary-preview';
    
    const summaryText = document.createElement('div');
    summaryText.className = 'summary-text';
    
    // 确保简明摘要存在
    const briefSummary = paper['简明摘要'] || '无摘要';
    
    // 移动设备显示更少字符
    const isMobile = window.innerWidth < 768;
    const maxLength = isMobile ? 40 : 60;
    
    // 使用简明摘要的前几个字符作为预览
    if (briefSummary.length > maxLength) {
        summaryText.textContent = briefSummary.substring(0, maxLength) + '...';
    } else {
        summaryText.textContent = briefSummary;
    }
    
    const toggleButton = document.createElement('button');
    toggleButton.className = 'toggle-summary-btn';
    toggleButton.textContent = '展开';
    toggleButton.onclick = function() {
        toggleHuggingFaceSummary(this, briefSummary); // 传递简明摘要而不是完整摘要
    };
    
    summaryPreview.appendChild(summaryText);
    summaryPreview.appendChild(toggleButton);
    
    // 将所有元素添加到卡片
    cardBody.appendChild(titleRow);
    cardBody.appendChild(summaryPreview);
    card.appendChild(cardBody);
    col.appendChild(card);
    
    return col;
}

// 切换HuggingFace论文摘要显示
function toggleHuggingFaceSummary(button, fullSummary) {
    const summaryPreview = button.parentElement;
    const cardBody = summaryPreview.parentElement;
    
    if (button.textContent === '展开') {
        // 创建完整摘要容器
        const summaryContainer = document.createElement('div');
        summaryContainer.className = 'summary-container';
        
        const summaryContent = document.createElement('div');
        summaryContent.className = 'summary-content';
        summaryContent.textContent = fullSummary || '无摘要';
        
        const collapseButton = document.createElement('button');
        collapseButton.className = 'collapse-summary-btn';
        collapseButton.textContent = '收起';
        collapseButton.onclick = function() {
            // 移除完整摘要容器
            summaryContainer.remove();
            // 显示摘要预览
            summaryPreview.style.display = 'flex';
            button.textContent = '展开';
        };
        
        summaryContainer.appendChild(summaryContent);
        summaryContainer.appendChild(collapseButton);
        
        // 隐藏预览，显示完整摘要
        summaryPreview.style.display = 'none';
        cardBody.appendChild(summaryContainer);
    }
}

// Render papers
function renderPapers(filteredPapers) {
    const container = document.getElementById('huggingface-papers-container');
    const template = document.getElementById('article-template'); // 使用与微信卡片相同的模板
    
    if (!container || !template) {
        return;
    }
    
    // 检查容器是否已经有内容（不是加载动画）
    if (container.innerHTML && !container.innerHTML.includes('spinner-border')) {
        console.log('容器已有内容，跳过HuggingFace论文渲染');
        return;
    }
    
    // Clear loading indicator
    container.innerHTML = '';
    
    // 使用传入的筛选后的论文，如果没有则使用所有论文
    const papersToRender = filteredPapers || preloadedData.papers || [];
    
    console.log(`渲染HuggingFace论文: ${papersToRender.length}篇`);
    
    if (papersToRender.length === 0) {
        // 检查是否是由于筛选导致的空结果
        const isFiltering = !preloadedData.selectedFields.has('all') || !preloadedData.selectedInstitutions.has('all');
        
        if (isFiltering && preloadedData.papers && preloadedData.papers.length > 0) {
            // 筛选导致的空结果
            container.innerHTML = '<div class="col-12 text-center mt-4 mb-4"><div class="empty-state"><i class="fas fa-filter fa-3x mb-3"></i><h4>没有符合要求的论文</h4></div></div>';
        } else {
            // 日期筛选或数据本身为空
            container.innerHTML = '<div class="col-12 text-center mt-4 mb-4"><div class="empty-state"><i class="fas fa-file-alt fa-3x mb-3"></i><h4>暂无论文</h4></div></div>';
        }
        return;
    }
    
    // 按点赞数排序（降序）
    papersToRender.sort((a, b) => {
        const upvotesA = parseInt(a['Upvote数'] || 0);
        const upvotesB = parseInt(b['Upvote数'] || 0);
        return upvotesB - upvotesA;
    });
    
    // 遍历论文数据并创建卡片
    papersToRender.forEach((paper) => {
        // 克隆模板
        const articleElement = template.content.cloneNode(true);
        
        // 设置标题，链接指向PDF
        const titleElement = articleElement.querySelector('.article-title');
        if (titleElement) {
            // 处理标题中可能存在的换行符，并在中英文之间添加空格
            const title = paper['标题'] ? paper['标题'].replace(/\n/g, ' ').trim() : '无标题';
            titleElement.textContent = addSpaceBetweenCnAndEn(title);
            titleElement.href = paper['PDF链接'] || paper.url || '#'; // 优先使用PDF链接
            titleElement.target = "_blank"; // 在新标签页中打开
            titleElement.style.color = '#0a2d6e';
        }
        
        // 设置中文标题
        const originalTitleElement = articleElement.querySelector('.original-title');
        if (originalTitleElement) {
            if (paper['中文标题']) {
                // 创建链接元素
                const linkElement = document.createElement('a');
                // 使用论文链接字段
                linkElement.href = paper['论文链接'] || paper['PDF链接'] || '#';
                // 在新标签页中打开链接
                linkElement.target = "_blank";
                // 处理中文标题中可能存在的换行符，并在中英文之间添加空格
                linkElement.textContent = addSpaceBetweenCnAndEn(paper['中文标题'].replace(/\n/g, ' ').trim());
                linkElement.style.color = '#0a2d6e';
                linkElement.style.textDecoration = 'none';
                // 添加链接到标题元素
                originalTitleElement.innerHTML = '';
                originalTitleElement.appendChild(linkElement);
            } else {
                originalTitleElement.style.display = 'none';
            }
        }
        
        // 不显示来源标签（HuggingFace）
        const sourceElement = articleElement.querySelector('.article-source');
        if (sourceElement) {
            sourceElement.style.display = 'none';
        }
        
        // 设置领域标签
        const fieldElement = articleElement.querySelector('.article-field');
        if (fieldElement && paper['领域分类']) {
            fieldElement.textContent = paper['领域分类'];
        } else if (fieldElement) {
            fieldElement.style.display = 'none';
        }
        
        // 设置机构标签（支持多个机构）
        const institutionTagsContainer = articleElement.querySelector('.institution-tags');
        if (institutionTagsContainer && paper['研究机构']) {
            // 分割机构名称（按逗号分隔）
            const institutions = paper['研究机构'].split(',').map(inst => inst.trim()).filter(inst => inst && inst !== 'Other');
            
            // 为每个机构创建标签
            institutions.forEach(institution => {
                const tagElement = document.createElement('span');
                tagElement.className = 'institution-tag';
                tagElement.textContent = institution;
                institutionTagsContainer.appendChild(tagElement);
            });
        }
        
        // 添加Upvote数标签
        if (paper['Upvote数']) {
            const upvoteTag = document.createElement('span');
            upvoteTag.className = 'upvote-tag';
            upvoteTag.innerHTML = `<i class="fas fa-thumbs-up"></i> ${paper['Upvote数']}`;
            
            // 将Upvote标签添加到标签容器中
            const tagContainer = articleElement.querySelector('.tag-container');
            if (tagContainer) {
                tagContainer.appendChild(upvoteTag);
            }
        }
        
        // 设置摘要预览（使用简明摘要）
        const summaryTextElement = articleElement.querySelector('.summary-text');
        const summaryPreviewContainer = articleElement.querySelector('.summary-preview');
        
        if (summaryTextElement && paper['简明摘要']) {
            // 使用固定字数限制
            const isMobile = window.innerWidth < 768;
            const maxLength = isMobile ? 40 : 60;
            
            // 处理简明摘要中可能存在的换行符，并在中英文之间添加空格
            const cleanedSummary = addSpaceBetweenCnAndEn(paper['简明摘要'].replace(/\n/g, ' ').trim());
            
            if (cleanedSummary.length > maxLength) {
                summaryTextElement.textContent = cleanedSummary.substring(0, maxLength) + '...';
            } else {
                summaryTextElement.textContent = cleanedSummary;
            }
            
            // 确保预览容器显示
            if (summaryPreviewContainer) {
                summaryPreviewContainer.style.display = 'flex';
            }
        } else if (summaryTextElement) {
            summaryTextElement.textContent = '无摘要';
        }
        
        // 设置完整摘要（也使用简明摘要）
        const summaryContentElement = articleElement.querySelector('.summary-content');
        if (summaryContentElement) {
            // 处理简明摘要中可能存在的换行符，并在中英文之间添加空格
            summaryContentElement.textContent = paper['简明摘要'] ? addSpaceBetweenCnAndEn(paper['简明摘要'].replace(/\n/g, ' ').trim()) : '无摘要';
        }
        
        // 添加展开摘要按钮事件
        const toggleButton = articleElement.querySelector('.toggle-summary-btn');
        const summaryContainer = articleElement.querySelector('.summary-container');
        
        if (toggleButton && summaryContainer && summaryPreviewContainer) {
            toggleButton.addEventListener('click', function() {
                // 展开摘要：隐藏预览，显示完整内容
                summaryContainer.style.display = 'block';
                summaryPreviewContainer.style.display = 'none';
            });
        }
        
        // 添加收起摘要按钮事件
        const collapseButton = articleElement.querySelector('.collapse-summary-btn');
        if (collapseButton && summaryContainer && summaryPreviewContainer) {
            collapseButton.addEventListener('click', function() {
                // 收起摘要：显示预览，隐藏完整内容
                summaryContainer.style.display = 'none';
                summaryPreviewContainer.style.display = 'flex';
            });
        }
        
        // 添加到容器
        container.appendChild(articleElement);
    });
}

// Render arxiv papers
function renderArxivPapers(filteredPapers) {
    const container = document.getElementById('huggingface-papers-container');
    const template = document.getElementById('article-template'); // 使用与微信卡片相同的模板
    
    if (!container || !template) {
        return;
    }
    
    // 检查容器是否已经有内容（不是加载动画）
    if (container.innerHTML && !container.innerHTML.includes('spinner-border')) {
        console.log('容器已有内容，跳过Arxiv论文渲染');
        return;
    }
    
    // Clear loading indicator
    container.innerHTML = '';
    
    // 使用传入的筛选后的论文，如果没有则使用所有论文
    const papersToRender = filteredPapers || preloadedData.arxivPapers || [];
    
    console.log(`渲染Arxiv论文: ${papersToRender.length}篇`);
    
    if (papersToRender.length === 0) {
        // 检查是否是由于筛选导致的空结果
        const isFiltering = !preloadedData.selectedFields.has('all') || !preloadedData.selectedInstitutions.has('all');
        
        if (isFiltering && preloadedData.arxivPapers && preloadedData.arxivPapers.length > 0) {
            // 筛选导致的空结果
            container.innerHTML = '<div class="col-12 text-center mt-4 mb-4"><div class="empty-state"><i class="fas fa-filter fa-3x mb-3"></i><h4>没有符合要求的论文</h4></div></div>';
        } else {
            // 日期筛选或数据本身为空
            container.innerHTML = '<div class="col-12 text-center mt-4 mb-4"><div class="empty-state"><i class="fas fa-file-alt fa-3x mb-3"></i><h4>暂无论文</h4></div></div>';
        }
        return;
    }
    
    // 按点赞数排序（降序）
    papersToRender.sort((a, b) => {
        const upvotesA = parseInt(a['点赞数'] || 0);
        const upvotesB = parseInt(b['点赞数'] || 0);
        return upvotesB - upvotesA;
    });
    
    // 遍历论文数据并创建卡片
    papersToRender.forEach((paper) => {
        // 克隆模板
        const articleElement = template.content.cloneNode(true);
        
        // 设置标题，链接指向PDF
        const titleElement = articleElement.querySelector('.article-title');
        if (titleElement) {
            // 处理标题中可能存在的换行符
            const title = paper['标题'] ? paper['标题'].replace(/\n/g, ' ').trim() : '无标题';
            titleElement.textContent = title;
            titleElement.href = paper['PDF链接'] || '#'; // 使用PDF链接
            titleElement.target = "_blank"; // 在新标签页中打开
            titleElement.style.color = '#0a2d6e';
        }
        
        // 设置中文标题
        const originalTitleElement = articleElement.querySelector('.original-title');
        if (originalTitleElement) {
            if (paper['中文标题']) {
                // 创建链接元素
                const linkElement = document.createElement('a');
                
                // 使用AlphaXiv链接字段，并确保替换所有的 arxiv 为 alphaxiv
                let link = paper['AlphaXiv链接'] || paper['PDF链接'] || '#';
                // 最后一道防线：确保 AlphaXiv 链接使用的是 alphaxiv 而不是 arxiv
                if (link && link.includes('arxiv')) {
                    link = link.replace(/arxiv/g, 'alphaxiv');
                    console.log('Final fix for AlphaXiv link in renderArxivPapers:', link);
                }
                linkElement.href = link;
                
                // 在新标签页中打开链接
                linkElement.target = "_blank";
                // 处理中文标题中可能存在的换行符
                linkElement.textContent = paper['中文标题'].replace(/\n/g, ' ').trim();
                linkElement.style.color = '#0a2d6e';
                linkElement.style.textDecoration = 'none';
                // 添加链接到标题元素
                originalTitleElement.innerHTML = '';
                originalTitleElement.appendChild(linkElement);
            } else {
                originalTitleElement.style.display = 'none';
            }
        }
        
        // 不显示来源标签
        const sourceElement = articleElement.querySelector('.article-source');
        if (sourceElement) {
            sourceElement.style.display = 'none';
        }
        
        // 设置领域标签
        const fieldElement = articleElement.querySelector('.article-field');
        if (fieldElement && paper['领域分类']) {
            fieldElement.textContent = paper['领域分类'];
        } else if (fieldElement) {
            fieldElement.style.display = 'none';
        }
        
        // 设置机构标签（支持多个机构）
        const institutionTagsContainer = articleElement.querySelector('.institution-tags');
        if (institutionTagsContainer && paper['研究机构']) {
            // 分割机构名称（按逗号分隔）
            const institutions = paper['研究机构'].split(',').map(inst => inst.trim()).filter(inst => inst && inst !== 'Other');
            
            // 为每个机构创建标签
            institutions.forEach(institution => {
                const tagElement = document.createElement('span');
                tagElement.className = 'institution-tag';
                tagElement.textContent = institution;
                institutionTagsContainer.appendChild(tagElement);
            });
        }
        
        // 添加点赞数标签
        if (paper['点赞数']) {
            const upvoteTag = document.createElement('span');
            upvoteTag.className = 'upvote-tag';
            upvoteTag.innerHTML = `<i class="fas fa-thumbs-up"></i> ${paper['点赞数']}`;
            
            // 将点赞标签添加到标签容器中
            const tagContainer = articleElement.querySelector('.tag-container');
            if (tagContainer) {
                tagContainer.appendChild(upvoteTag);
            }
        }
        
        // 设置摘要预览（使用简明摘要）
        const summaryTextElement = articleElement.querySelector('.summary-text');
        const summaryPreviewContainer = articleElement.querySelector('.summary-preview');
        
        if (summaryTextElement && paper['简明摘要']) {
            // 使用固定字数限制
            const isMobile = window.innerWidth < 768;
            const maxLength = isMobile ? 40 : 60;
            
            // 处理简明摘要中可能存在的换行符，并在中英文之间添加空格
            const cleanedSummary = addSpaceBetweenCnAndEn(paper['简明摘要'].replace(/\n/g, ' ').trim());
            
            if (cleanedSummary.length > maxLength) {
                summaryTextElement.textContent = cleanedSummary.substring(0, maxLength) + '...';
            } else {
                summaryTextElement.textContent = cleanedSummary;
            }
            
            // 确保预览容器显示
            if (summaryPreviewContainer) {
                summaryPreviewContainer.style.display = 'flex';
            }
        } else if (summaryTextElement) {
            summaryTextElement.textContent = '无摘要';
        }
        
        // 设置完整摘要（也使用简明摘要）
        const summaryContentElement = articleElement.querySelector('.summary-content');
        if (summaryContentElement) {
            // 处理简明摘要中可能存在的换行符，并在中英文之间添加空格
            summaryContentElement.textContent = paper['简明摘要'] ? addSpaceBetweenCnAndEn(paper['简明摘要'].replace(/\n/g, ' ').trim()) : '无摘要';
        }
        
        // 添加展开摘要按钮事件
        const toggleButton = articleElement.querySelector('.toggle-summary-btn');
        const summaryContainer = articleElement.querySelector('.summary-container');
        
        if (toggleButton && summaryContainer && summaryPreviewContainer) {
            toggleButton.addEventListener('click', function() {
                // 展开摘要：隐藏预览，显示完整内容
                summaryContainer.style.display = 'block';
                summaryPreviewContainer.style.display = 'none';
            });
        }
        
        // 添加收起摘要按钮事件
        const collapseButton = articleElement.querySelector('.collapse-summary-btn');
        if (collapseButton && summaryContainer && summaryPreviewContainer) {
            collapseButton.addEventListener('click', function() {
                // 收起摘要：显示预览，隐藏完整内容
                summaryContainer.style.display = 'none';
                summaryPreviewContainer.style.display = 'flex';
            });
        }
        
        // 添加到容器
        container.appendChild(articleElement);
    });
}

// 日期处理函数
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDateFromString(dateString) {
    // 解析YYYY-MM-DD格式的日期字符串
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function generatePastDates(days) {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        dates.push(formatDate(date));
    }
    
    return dates;
}

// 初始化日期选择器
function initDateFilter() {
    const dateFilter = document.getElementById('date-filter');
    if (!dateFilter) return;
    
    // 清空现有选项
    dateFilter.innerHTML = '';
    
    // 生成过去几天的日期选项
    const dates = generatePastDates(DAYS_TO_KEEP);
    
    // 添加日期选项
    dates.forEach((date, index) => {
        const option = document.createElement('option');
        option.value = date;
        
        // 格式化显示文本
        const displayDate = new Date(date);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        
        if (index === 0) {
            option.textContent = `今天`;
        } else if (index === 1) {
            option.textContent = `昨天`;
        } else {
            // 使用简洁的日期格式，只显示月和日
            const month = displayDate.getMonth() + 1; // getMonth() 返回 0-11
            const day = displayDate.getDate();
            option.textContent = `${month}月${day}日`;
        }
        
        dateFilter.appendChild(option);
    });
    
    // 设置默认选中值为今天
    dateFilter.value = selectedDate;
    
    // 添加事件监听器
    dateFilter.addEventListener('change', function() {
        selectedDate = this.value;
        
        // 更新URL，但不刷新页面
        const url = new URL(window.location);
        url.searchParams.set('date', selectedDate);
        window.history.pushState({}, '', url);
        
        // 加载选定日期的数据
        loadDataForDate(selectedDate);
    });
}

// 根据选择的日期加载数据
function loadDataForDate(date) {
    // 保存当前的筛选条件，确保日期切换后能重新应用
    const savedSelectedFields = new Set(preloadedData.selectedFields);
    const savedSelectedInstitutions = new Set(preloadedData.selectedInstitutions);
    
    // 清空现有数据
    preloadedData.wechatArticles = null;
    preloadedData.papers = null;
    preloadedData.arxivPapers = null;
    
    // 清空显示容器
    document.getElementById('wechat-articles-container').innerHTML = 
        '<div class="col-12 text-center"><div class="spinner-border wechat-loading" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    document.getElementById('huggingface-papers-container').innerHTML = 
        '<div class="col-12 text-center"><div class="spinner-border huggingface-loading" role="status"><span class="sr-only">Loading...</span></div></div>';
    
    // 加载数据
    const wechatPromise = new Promise(resolve => {
        fetchWechatArticles(date);
        // 由于fetchWechatArticles是异步的，我们需要等待一段时间
        setTimeout(resolve, 1000);
    });
    
    const papersPromise = new Promise(resolve => {
        fetchPapers(date);
        setTimeout(resolve, 1000);
    });
    
    const arxivPromise = new Promise(resolve => {
        fetchArxivPapers(date);
        setTimeout(resolve, 1000);
    });
    
    // 等待所有数据加载完成后重新应用筛选条件
    Promise.all([wechatPromise, papersPromise, arxivPromise]).then(() => {
        console.log('All data loaded, reapplying filters');
        
        // 恢复保存的筛选条件
        preloadedData.selectedFields = savedSelectedFields;
        preloadedData.selectedInstitutions = savedSelectedInstitutions;
        
        // 更新UI显示
        updateSelectedDisplay('field');
        updateSelectedDisplay('institution');
        
        // 重新应用筛选
        applyFilters();
        
        // 更新筛选信息
        updateFilterInfo();
    });
}

// 添加这个函数用于修复所有论文数据中的 AlphaXiv 链接
function fixAlphaXivLinks(papers) {
    if (!papers || !Array.isArray(papers)) return papers;
    
    papers.forEach(paper => {
        if (paper['AlphaXiv链接'] && paper['AlphaXiv链接'].includes('arxiv')) {
            paper['AlphaXiv链接'] = paper['AlphaXiv链接'].replace(/arxiv/g, 'alphaxiv');
            console.log('Fixed AlphaXiv link in data:', paper['AlphaXiv链接']);
        }
    });
    
    return papers;
}

// 添加一个强制清除缓存并重新加载的函数
function forceReloadData() {
    console.log('Forcing data reload...');
    
    // 清除所有缓存
    localStorage.removeItem(CACHE_KEYS.WECHAT_ARTICLES);
    localStorage.removeItem(CACHE_KEYS.PAPERS);
    localStorage.removeItem(CACHE_KEYS.ARXIV_PAPERS);
    localStorage.removeItem(CACHE_KEYS.LAST_UPDATED);
    
    // 重置数据
    preloadedData = {
        wechatArticles: null,
        papers: null,
        arxivPapers: null,
        fields: new Set(),
        institutions: new Set(),
        selectedFields: new Set(['all']),
        selectedInstitutions: new Set(['all'])
    };
    
    // 重新加载当前日期的数据
    loadDataForDate(selectedDate);
}