function onFirebaseReady(callback) {
  if (window.firebaseReady) {
    callback(); // Firebase уже готов — запускаем сразу
  } else {
    window.addEventListener("firebase-ready", callback); // ещё не готов — ждём сигнал
  }
}
/* ===================================================
           база данных
           здесь добавлять темы и уроки
           =================================================== */
        let COURSE_DATA = {
            topics: [],
            lessons: {}
        };

        // ===================================================
        // СЮДА ВСТАВЛЯТЬ ССЫЛКИ НА RAW ФАЙЛЫ С ГИТХАБА (в формате JSON)
        // Пример: "https://raw.githubusercontent.com/username/repo/main/topic1.json"
        // ===================================================
        const TOPIC_URLS = [
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/6-zadanie.json",
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/8-zadanie.json",
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/9-zadanie",
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/10-zadanie",
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/13-zadanie.json",
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/14%20%D0%B7%D0%B0%D0%B4%D0%B0%D0%BD%D0%B8%D0%B5",
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/20-zadanie"
        ];

        // ===================================================
        // СЮДА ВСТАВЛЯТЬ ССЫЛКИ НА ФАЙЛЫ СО ШПАРГАЛКАМИ (в формате JSON)
        // Пример: "https://raw.githubusercontent.com/username/repo/main/cheatsheets.json"
        // ===================================================
        const CHEAT_SHEET_URLS = [
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/Discriminant",
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/hpargalka.json",
  "https://cdn.jsdelivr.net/gh/ignatt002/blait@main/Veroatnost"
        ];

        async function loadCourseData() {
            const topicsContainer = document.getElementById('topics-container');
            
            if (TOPIC_URLS.length === 0) {
                topicsContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: #afafaf; font-weight: 700;">Нет добавленных тем.<br>Добавьте ссылки в массив TOPIC_URLS в коде.</div>';
                return;
            }

            topicsContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: #1CB0F6; font-weight: 800; font-size: 20px;">Загрузка тем...</div>';

            try {
                const fetchPromises = TOPIC_URLS.map(url => fetch(url).then(res => {
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    return res.json();
                }));
                
                const csPromises = CHEAT_SHEET_URLS.map(url => fetch(url).then(res => {
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    return res.json();
                }));

                const [topicsData, csData] = await Promise.all([
                    Promise.all(fetchPromises),
                    Promise.all(csPromises)
                ]);

                topicsData.forEach((data, index) => {
                    if (data.topic) {
                        // Клонируем объект, чтобы не мутировать исходный, если ссылки одинаковые
                        let topicCopy = JSON.parse(JSON.stringify(data.topic));
topicCopy.baseId = data.topic.id;
topicCopy.id = topicCopy.id + '-' + index;
                        COURSE_DATA.topics.push(topicCopy);
                    }
                    if (data.lessons) {
                        Object.assign(COURSE_DATA.lessons, data.lessons);
                    }
                    // Оставляем поддержку шпаргалок внутри тем для обратной совместимости
                    if (data.cheatSheets && Array.isArray(data.cheatSheets)) {
                        data.cheatSheets.forEach(sheet => {
                            if (!cheatSheetsConfig.find(s => s.id === sheet.id)) {
                                cheatSheetsConfig.push(sheet);
                            }
                        });
                    }
                });

                // Обработка отдельных файлов со шпаргалками
                csData.forEach(data => {
                    if (data.cheatSheets && Array.isArray(data.cheatSheets)) {
                        data.cheatSheets.forEach(sheet => {
                            if (!cheatSheetsConfig.find(s => s.id === sheet.id)) {
                                cheatSheetsConfig.push(sheet);
                            }
                        });
                    }
                });

                // После загрузки всех данных рендерим темы
                preprocessCourseData();
                renderTopics();
                renderRepetitionTopics();
            } catch (error) {
                console.error("Ошибка при загрузке данных:", error);
                topicsContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: #ff4b4b; font-weight: 700;">Ошибка загрузки тем.<br>Ой... Не переживайте, я уже исправляю это!</div>';
            }
        }

        /* ---------------------------------------------------
           ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И ЛОГИКА
           --------------------------------------------------- */
        
        // НАСТРОЙКИ ШПАРГАЛОК
        // Здесь вы можете добавлять новые темы и шпаргалки.
        // type: 'text' - обычный текст
        // type: 'table' - таблица в вашем формате
        let cheatSheetsConfig = [];

        function parseCustomTable(text) {
            let cols = 1, rows = 1;
            const colMatch = text.match(/столбов:\s*(\d+)/i);
            if (colMatch) cols = parseInt(colMatch[1]);
            
            const rowMatch = text.match(/строк:\s*(\d+)/i);
            if (rowMatch) rows = parseInt(rowMatch[1]);
            
            const data = Array.from({length: rows}, () => Array(cols).fill(''));
            
            const cellRegex = /столб\s+(\d+)[,\s]*строка\s+(\d+)[:\s]+([\s\S]*?)(?=(?:столб\s+\d+[,\s]*строка\s+\d+[:\s]+)|$)/gi;
            
            let match;
            while ((match = cellRegex.exec(text)) !== null) {
                const c = parseInt(match[1]) - 1;
                const r = parseInt(match[2]) - 1;
                let content = match[3].trim();
                if (content.endsWith('.')) {
                    content = content.slice(0, -1).trim();
                }
                if (r >= 0 && r < rows && c >= 0 && c < cols) {
                    data[r][c] = content;
                }
            }
            return { cols, rows, data };
        }

        function toggleCheatSheet() {
            const wrapper = document.getElementById('cheat-sheet-wrapper');
            if (wrapper.classList.contains('active')) {
                closeCheatSheet();
            } else {
                openCheatSheetMenu();
            }
        }

        function animateCSBody(direction, renderCallback) {
            const body = document.getElementById('cs-body');
            const title = document.getElementById('cs-title');
            const modal = document.querySelector('.cs-modal');
            
            const startHeight = modal.offsetHeight;
            modal.style.height = startHeight + 'px';
            
            body.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
            body.style.opacity = '0';
            body.style.transform = direction === 'forward' ? 'translateX(-20px)' : 'translateX(20px)';
            
            title.style.opacity = '0';

            setTimeout(() => {
                renderCallback();
                
                modal.style.height = 'auto';
                const targetHeight = modal.offsetHeight;
                
                modal.style.height = startHeight + 'px';
                void modal.offsetHeight;
                
                modal.style.height = targetHeight + 'px';
                
                body.style.transition = 'none';
                body.style.transform = direction === 'forward' ? 'translateX(20px)' : 'translateX(-20px)';
                
                void body.offsetWidth;
                
                body.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                body.style.opacity = '1';
                body.style.transform = 'translateX(0)';
                
                title.style.opacity = '1';
                
                setTimeout(() => {
                    modal.style.height = '';
                }, 300);
            }, 150);
        }

        function openCheatSheetMenu(isBack = false) {
            const overlay = document.getElementById('cs-overlay');
            const wrapper = document.getElementById('cheat-sheet-wrapper');
            const isOpen = wrapper.classList.contains('active');
            
            const render = () => {
                const body = document.getElementById('cs-body');
                const title = document.getElementById('cs-title');
                const backBtn = document.getElementById('cs-back-btn');
                
                title.innerText = 'Шпаргалки';
                backBtn.classList.remove('visible');
                body.innerHTML = '';
                
                if (cheatSheetsConfig.length === 0) {
                    body.innerHTML = '<div class="cs-text" style="text-align:center; color:#999;">Шпаргалки пока не добавлены</div>';
                    return;
                }

                cheatSheetsConfig.forEach(sheet => {
                    const btn = document.createElement('button');
                    btn.className = 'cs-topic-btn';
                    btn.innerText = sheet.title;
                    btn.onclick = () => openCheatSheetTopic(sheet.id);
                    body.appendChild(btn);
                });
            };

            if (isOpen && isBack) {
                animateCSBody('backward', render);
            } else {
                render();
                overlay.classList.add('active');
                wrapper.classList.add('active');
            }
        }

        function closeCheatSheet() {
            document.getElementById('cs-overlay').classList.remove('active');
            document.getElementById('cheat-sheet-wrapper').classList.remove('active');
        }

        function openCheatSheetTopic(id) {
            const sheet = cheatSheetsConfig.find(s => s.id === id);
            if (!sheet) return;
            
            const render = () => {
                const body = document.getElementById('cs-body');
                const title = document.getElementById('cs-title');
                const backBtn = document.getElementById('cs-back-btn');
                
                title.innerText = sheet.title;
                backBtn.classList.add('visible');
                body.innerHTML = '';
                
                sheet.items.forEach(item => {
                    if (item.type === 'text') {
                        const div = document.createElement('div');
                        div.className = 'cs-text';
                        div.innerHTML = item.content;
                        body.appendChild(div);
                    } else if (item.type === 'table') {
                        const parsed = parseCustomTable(item.content);
                        const table = document.createElement('table');
                        table.className = 'cs-table';
                        
                        parsed.data.forEach(rowData => {
                            const tr = document.createElement('tr');
                            rowData.forEach(cellData => {
                                const td = document.createElement('td');
                                td.innerHTML = cellData;
                                tr.appendChild(td);
                            });
                            table.appendChild(tr);
                        });
                        body.appendChild(table);
                    }
                });
                
                if (window.MathJax) {
                    MathJax.typesetPromise([body]).catch((err) => console.log(err.message));
                }
            };

            animateCSBody('forward', render);
        }

        let currentTopic = null;
        let currentLesson = null;
        let currentLessonId = null;
let currentLessonFailedTasks = [];
let justCompletedLessonId = null;
let currentTopicBaseId = null;
        let currentTaskIndex = 0;
        let lessonStartTime = 0;
        let lessonErrors = 0;

        // Инициализация при загрузке
        function preprocessCourseData() {
            COURSE_DATA.topics.forEach(topic => {
                topic.subtopics.forEach(subtopic => {
                    let finalLevels = [];
                    let pendingPlaced = [];
                    let regularLevels = [];
                    
                    subtopic.levels.forEach(level => {
                        const levelId = typeof level === 'object' ? level.lessonId : level;
                        const lesson = COURSE_DATA.lessons[levelId];
                        if (lesson && lesson.placeAfter !== undefined) {
                            pendingPlaced.push(level);
                        } else {
                            regularLevels.push(level);
                        }
                    });
                    
                    let toInsert0 = pendingPlaced.filter(level => {
                        const levelId = typeof level === 'object' ? level.lessonId : level;
                        return COURSE_DATA.lessons[levelId].placeAfter === 0;
                    });
                    finalLevels.push(...toInsert0);
                    
                    let regCount = 0;
                    for (let i = 0; i < regularLevels.length; i++) {
                        const level = regularLevels[i];
                        finalLevels.push(level);
                        
                        const levelId = typeof level === 'object' ? level.lessonId : level;
                        const lesson = COURSE_DATA.lessons[levelId];
                        if (!lesson || !lesson.isTest) {
                            regCount++;
                        }
                        
                        let toInsert = pendingPlaced.filter(l => {
                            const lId = typeof l === 'object' ? l.lessonId : l;
                            return COURSE_DATA.lessons[lId].placeAfter === regCount;
                        });
                        finalLevels.push(...toInsert);
                    }
                    
                    let placedSoFar = new Set(finalLevels);
                    pendingPlaced.forEach(level => {
                        if (!placedSoFar.has(level)) {
                            finalLevels.push(level);
                        }
                    });
                    
                    subtopic.levels = finalLevels;
                });
            });
        }

        window.onload = () => {
            loadCourseData();
            initLongPressKeys();
            initAccountLogic();
            updateBottomNavVisibility('page-topics');
            updateBottomNavActive('topics');
        };

        function renderTopics() {
            const topicsContainer = document.getElementById('topics-container');
            topicsContainer.innerHTML = '';
            
            COURSE_DATA.topics.forEach(topic => {
                const wrapper = document.createElement('div');
                wrapper.className = 'topic-wrapper';
                
                const btnGroup = document.createElement('div');
                btnGroup.className = 'topic-btn-group';
                
                const mainBtn = document.createElement('button');
                mainBtn.className = 'topic-main-btn';
                mainBtn.innerText = topic.title;
                mainBtn.onclick = () => openTopic(topic.id, 0);
                
                const divider = document.createElement('div');
                divider.className = 'topic-divider';
                
                const arrowBtn = document.createElement('button');
                arrowBtn.className = 'topic-arrow-btn';
                arrowBtn.innerHTML = '<span class="arrow-icon">▼</span>';
                arrowBtn.onclick = (e) => {
                    e.stopPropagation();
                    const subWrapper = document.getElementById(`sub-${topic.id}`);
                    subWrapper.classList.toggle('expanded');
                    arrowBtn.classList.toggle('expanded');
                    divider.classList.toggle('hidden');
                };
                
                btnGroup.appendChild(mainBtn);
                btnGroup.appendChild(divider);
                btnGroup.appendChild(arrowBtn);
                
                const subWrapper = document.createElement('div');
                subWrapper.id = `sub-${topic.id}`;
                subWrapper.className = 'subtopics-wrapper';
                
                const subContainer = document.createElement('div');
                subContainer.className = 'subtopics-container';
                
                const subInner = document.createElement('div');
                subInner.className = 'subtopics-inner';
                
                topic.subtopics.forEach((sub, index) => {
                    const subRow = document.createElement('button');
                    subRow.className = 'subtopic-row';
                    subRow.innerText = sub.title;
                    subRow.onclick = () => openTopic(topic.id, index);
                    
                    subInner.appendChild(subRow);
                });
                
                subContainer.appendChild(subInner);
                subWrapper.appendChild(subContainer);
                
                wrapper.appendChild(btnGroup);
                wrapper.appendChild(subWrapper);
                topicsContainer.appendChild(wrapper);
            });
        }

        function initLongPressKeys() {
            let popupTimeout;
            let activePopup = null;

            document.querySelectorAll('.has-popup').forEach(key => {
                const baseVal = key.getAttribute('data-base');
                const popupVals = key.getAttribute('data-popup').split(',');

                const handleStart = (e) => {
                    e.preventDefault(); // Prevent focus loss
                    if (activePopup && activePopup.parentNode !== key) {
                        activePopup.remove();
                        activePopup = null;
                    }
                    if (activePopup && activePopup.parentNode === key) {
                        return; // Already open
                    }
                    key.classList.add('active-press');
                    popupTimeout = setTimeout(() => {
                        key.classList.remove('active-press');
                        showPopup(key, popupVals);
                    }, 400); // 400ms long press
                };

                const handleEnd = (e) => {
                    e.preventDefault();
                    clearTimeout(popupTimeout);
                    if (key.classList.contains('active-press')) {
                        // Short press
                        key.classList.remove('active-press');
                        insertMath(baseVal);
                    }
                };

                key.addEventListener('mousedown', handleStart);
                key.addEventListener('mouseup', handleEnd);
                key.addEventListener('mouseleave', () => {
                    clearTimeout(popupTimeout);
                    key.classList.remove('active-press');
                });

                key.addEventListener('touchstart', handleStart, {passive: false});
                key.addEventListener('touchend', handleEnd, {passive: false});
                key.addEventListener('touchcancel', () => {
                    clearTimeout(popupTimeout);
                    key.classList.remove('active-press');
                });
            });

            function showPopup(key, vals) {
                const popup = document.createElement('div');
                popup.className = 'math-key-popup';
                vals.forEach(val => {
                    const btn = document.createElement('button');
                    btn.className = 'math-popup-btn';
                    btn.innerText = val;
                    
                    const triggerInsert = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        insertMath(val);
                        popup.remove();
                        activePopup = null;
                    };
                    
                    btn.addEventListener('mousedown', triggerInsert);
                    btn.addEventListener('touchstart', triggerInsert, {passive: false});
                    popup.appendChild(btn);
                });
                key.appendChild(popup);
                activePopup = popup;
            }

            // Close popup if clicking elsewhere
            const closePopup = (e) => {
                if (activePopup && !activePopup.contains(e.target) && activePopup.parentNode !== e.target) {
                    activePopup.remove();
                    activePopup = null;
                }
            };
            document.addEventListener('mousedown', closePopup);
            document.addEventListener('touchstart', closePopup, {passive: false});
        }

        let currentAppState = 'topics';
        let lessonCompleted = false;
        let isProgrammaticBack = false;

        window.addEventListener('load', () => {
            if (!history.state) {
                history.replaceState({ page: 'topics' }, '');
            } else {
                currentAppState = history.state.page || 'topics';
            }
        });

        window.addEventListener('popstate', (event) => {
            const targetPage = event.state ? event.state.page : 'topics';

            // 1. Path Popup (Map circles)
            if (currentAppState === 'path_popup' && targetPage === 'path') {
                hideLessonPopupVisuals();
                currentAppState = 'path';
            }
            // 2. Theory Modals
            else if (currentAppState === 'theory' && (targetPage === 'path' || targetPage === 'lesson' || targetPage === 'repetition' || targetPage === 'topics')) {
                document.getElementById('theory-view').classList.remove('active');
                if (targetPage !== 'lesson') {
                    showBottomNavForAppPage(targetPage);
                }
                currentAppState = targetPage;
            }
            // 2b. Repetition setup modal
            else if (currentAppState === 'repetition_setup' && targetPage === 'repetition') {
                hideRepetitionSetupVisuals();
                showBottomNavForAppPage('repetition');
                currentAppState = 'repetition';
            }
            // 3. Exit Modal (from Lesson X button)
            else if (currentAppState === 'exit_modal' && (targetPage === 'path' || targetPage === 'lesson' || targetPage === 'repetition')) {
                hideExitModalVisuals();
                currentAppState = targetPage === 'lesson' ? 'lesson' : targetPage;
            }
            // 4. Exit Modal (from Hardware Back button in Lesson)
            else if (currentAppState === 'exit_modal' && (targetPage === 'path' || targetPage === 'repetition')) {
                if (isProgrammaticBack) {
                    isProgrammaticBack = false;
                    hideExitModalVisuals();
                    setTimeout(() => {
                        actuallyCloseLesson();
                    }, 300);
                    currentAppState = targetPage;
                } else {
                    hideExitModalVisuals();
                    history.pushState({ page: 'lesson' }, '');
                    currentAppState = 'lesson';
                }
            }
            // 5. Lesson -> Path or Repetition (Hardware Back)
            else if (currentAppState === 'lesson' && (targetPage === 'path' || targetPage === 'repetition')) {
                if (lessonCompleted) {
                    actuallyCloseLesson();
                    currentAppState = lessonReturnMenuPage === 'page-repetition' ? 'repetition' : 'path';
                } else {
                    const fromPage = lessonReturnMenuPage === 'page-repetition' ? 'repetition' : 'path';
                    history.pushState({ page: 'exit_modal', from: fromPage }, '');
                    showExitModalVisuals();
                    currentAppState = 'exit_modal';
                }
            }
            // 6. Math Keyboard
            else if (currentAppState === 'math_keyboard' && targetPage === 'lesson') {
                closeMathKeyboardVisuals();
                currentAppState = 'lesson';
            }
            // 7. Lesson Dropdown
            else if (currentAppState === 'lesson_dropdown' && targetPage === 'lesson') {
                document.getElementById('lesson-dropdown').classList.add('hidden');
                currentAppState = 'lesson';
            }
            // 8. Report Modal
            else if (currentAppState === 'report_modal' && targetPage === 'lesson_dropdown') {
                document.getElementById('report-modal-overlay').classList.add('hidden');
                document.getElementById('lesson-dropdown').classList.remove('hidden');
                currentAppState = 'lesson_dropdown';
            }
            // 9. Path -> Topics
            else if (currentAppState === 'path' && targetPage === 'topics') {
                navigateMenu('page-topics', true);
                currentAppState = 'topics';
            }
            // 10. Repetition <-> Topics
            else if (currentAppState === 'repetition' && targetPage === 'topics') {
                navigateToMenuTab('topics', true);
                currentAppState = 'topics';
            }
            else if (currentAppState === 'topics' && targetPage === 'repetition') {
                navigateToMenuTab('repetition', true);
                currentAppState = 'repetition';
            }
            // Fallbacks
            else if (targetPage === 'path') {
                navigateMenu('page-path', true);
                currentAppState = 'path';
            }
            else if (targetPage === 'topics') {
                if (currentAppState === 'lesson' || currentAppState === 'exit_modal' || currentAppState === 'theory' || currentAppState === 'math_keyboard' || currentAppState === 'lesson_dropdown' || currentAppState === 'report_modal') {
                    hideExitModalVisuals();
                    document.getElementById('theory-view').classList.remove('active');
                    document.getElementById('lesson-dropdown').classList.add('hidden');
                    document.getElementById('report-modal-overlay').classList.add('hidden');
                    closeMathKeyboardVisuals();
                    actuallyCloseLesson();
                } else if (currentAppState === 'path' || currentAppState === 'path_popup') {
                    hideLessonPopupVisuals();
                    navigateMenu('page-topics', true);
                } else if (currentAppState === 'repetition') {
                    navigateToMenuTab('topics', true);
                }
                currentAppState = 'topics';
            }
            else if (targetPage === 'repetition') {
                if (currentAppState === 'lesson' || currentAppState === 'exit_modal' || currentAppState === 'theory' || currentAppState === 'math_keyboard' || currentAppState === 'lesson_dropdown' || currentAppState === 'report_modal') {
                    hideExitModalVisuals();
                    document.getElementById('theory-view').classList.remove('active');
                    document.getElementById('lesson-dropdown').classList.add('hidden');
                    document.getElementById('report-modal-overlay').classList.add('hidden');
                    closeMathKeyboardVisuals();
                    actuallyCloseLesson();
                } else if (currentAppState === 'path' || currentAppState === 'path_popup') {
                    hideLessonPopupVisuals();
                    navigateToMenuTab('repetition', true);
                } else if (currentAppState === 'topics') {
                    navigateToMenuTab('repetition', true);
                }
                currentAppState = 'repetition';
            }
        });

        function showExitModalVisuals() {
            const overlay = document.getElementById('exit-confirm-overlay');
            const content = document.getElementById('exit-confirm-content');
            if(overlay && content) {
                overlay.classList.remove('hidden');
                void overlay.offsetWidth;
                overlay.style.opacity = '1';
                content.style.transform = 'translateY(0)';
            }
        }

        function hideExitModalVisuals() {
            const overlay = document.getElementById('exit-confirm-overlay');
            const content = document.getElementById('exit-confirm-content');
            if(overlay && content) {
                overlay.style.opacity = '0';
                content.style.transform = 'translateY(100%)';
                setTimeout(() => {
                    overlay.classList.add('hidden');
                }, 300);
            }
        }

        // Close exit modal on overlay click
        document.addEventListener('click', (e) => {
            const overlay = document.getElementById('exit-confirm-overlay');
            const content = document.getElementById('exit-confirm-content');
            if (overlay && !overlay.classList.contains('hidden') && e.target === overlay) {
                closeExitConfirmModal();
            }
        });

        let isNavigating = false;
        function navigateMenu(targetPageId, fromPopState = false) {
            if (isNavigating) return;
            
            if (!fromPopState) {
                const page = targetPageId === 'page-path' ? 'path' : 'topics';
                if (currentAppState !== page) {
                    history.pushState({ page: page }, '');
                    currentAppState = page;
                }
            }

            updateBottomNavVisibility(targetPageId);
            if (targetPageId === 'page-topics' || targetPageId === 'page-path') updateBottomNavActive('topics');
            
            const pages = ['page-topics', 'page-path', 'page-repetition'];
            const currentVisible = pages.find(id => !document.getElementById(id).classList.contains('hidden')) || 'page-topics';
            
            if (currentVisible === targetPageId) return;

            if (targetPageId === 'page-path') {
                pages.forEach(id => {
                    if (id !== targetPageId) document.getElementById(id).classList.add('hidden');
                });
                document.getElementById(targetPageId).classList.remove('hidden');
                return;
            }

            if (targetPageId === 'page-topics') {
                pages.forEach(id => document.getElementById(id).classList.add('hidden'));
                document.getElementById('page-topics').classList.remove('hidden');
                return;
            }
            
            const currentId = currentVisible;
            const current = document.getElementById(currentId);
            const target = document.getElementById(targetPageId);
            
            if (current.classList.contains('hidden')) {
                target.classList.remove('hidden');
                return;
            }

            isNavigating = true;
            const isForward = targetPageId === 'page-path';
            
            current.style.animation = isForward ? 'slideOutLeft 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' : 'slideOutRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
            
            setTimeout(() => {
                current.classList.add('hidden');
                current.style.animation = '';
                
                target.classList.remove('hidden');
                target.style.animation = isForward ? 'slideInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' : 'slideInLeft 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
                window.scrollTo(0, 0);
                
                setTimeout(() => {
                    target.style.animation = '';
                    isNavigating = false;
                }, 300);
            }, 250);
        }

        // Вспомогательная функция для затемнения цвета (для 3D тени)
        function darkenColor(hex, percent) {
            hex = hex.replace(/^\s*#|\s*$/g, '');
            if(hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
            let r = parseInt(hex.substr(0, 2), 16),
                g = parseInt(hex.substr(2, 2), 16),
                b = parseInt(hex.substr(4, 2), 16);
            r = Math.max(0, Math.floor(r * (1 - percent / 100)));
            g = Math.max(0, Math.floor(g * (1 - percent / 100)));
            b = Math.max(0, Math.floor(b * (1 - percent / 100)));
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }

        let currentTopicId = null;
        let currentSubtopicIndex = null;
        let savedPathScrollPosition = 0;
        let savedMenuScrollPosition = 0;
        let lessonReturnMenuPage = 'page-topics';
        let activeMenuTab = 'topics';

        const REPETITION_TASK_COUNT = 10;

        const REPETITION_TOPIC_META = {
            '6 задание': { subtitle: 'Дроби и вычисления', icon: 'divide' },
            '7 задание': { subtitle: 'Координатная прямая', icon: 'move-horizontal' },
            '8 задание': { subtitle: 'Алгебраические выражения', icon: 'calculator' },
            '9 задание': { subtitle: 'Уравнения и системы', icon: 'root-x' },
            '10 задание': { subtitle: 'Вероятности', icon: 'dices' },
            '11 задание': { subtitle: 'Графики функций', icon: 'line-chart' },
            '13 задание': { subtitle: 'Решение неравенств', icon: 'greater-equal' },
            '14 задание': { subtitle: 'Прогрессии', icon: 'trending-up' }
        };

        function getRepetitionTopicMeta(topic) {
            const meta = REPETITION_TOPIC_META[topic.title];
            if (meta) return meta;
            return {
                subtitle: topic.subtopics[0] ? topic.subtopics[0].title : 'Все разделы темы',
                icon: 'calculator'
            };
        }

        function getRepetitionIconSvg(iconName) {
            const icons = {
                divide: '<svg class="repetition-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
                'move-horizontal': '<svg class="repetition-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8l4 4-4 4"/><path d="M6 8l-4 4 4 4"/><line x1="2" y1="12" x2="22" y2="12"/></svg>',
                calculator: '<svg class="repetition-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="16" y2="18"/></svg>',
                'root-x': '<svg class="repetition-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13l3 5 5-13h11"/><path d="M13 11l6 6"/><path d="M19 11l-6 6"/></svg>',
                dices: '<svg class="repetition-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
                'line-chart': '<svg class="repetition-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 5-8"/></svg>',
                'greater-equal': '<svg class="repetition-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 5-14 5"/><path d="M5 20l14-5"/></svg>',
                'trending-up': '<svg class="repetition-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-10"/><path d="M14 5h7v7"/></svg>'
            };
            return icons[iconName] || icons.calculator;
        }

        function gatherRepetitionTasksFromTopic(topic, count, subtopicIndices = null) {
            let allTasks = [];
            topic.subtopics.forEach((st, index) => {
                if (subtopicIndices !== null && !subtopicIndices.includes(index)) return;
                st.levels.forEach(l => {
                    const lId = typeof l === 'object' ? l.lessonId : l;
                    const lesson = COURSE_DATA.lessons[lId];
                    if (lesson && !lesson.isRepetition && !lesson.isGenerator && lesson.tasks) {
                        lesson.tasks.forEach(task => {
                            if (task['повторение темы'] === 'нет' || task['повторение темы'] === false) return;
                            if (task.correctAnswer !== undefined && task.correctAnswer !== "") {
                                allTasks.push({ ...task });
                            }
                        });
                    }
                });
            });
            allTasks.sort(() => Math.random() - 0.5);
            return allTasks.slice(0, count);
        }

        function getVisibleMenuPageId() {
            if (!document.getElementById('page-path').classList.contains('hidden')) return 'page-path';
            if (!document.getElementById('page-repetition').classList.contains('hidden')) return 'page-repetition';
            return 'page-topics';
        }

        function showBottomNavForAppPage(appPage) {
            const pageId = appPage === 'path' ? 'page-path' : appPage === 'repetition' ? 'page-repetition' : 'page-topics';
            showBottomNav(pageId);
        }

        function hideBottomNav() {
            const bottomNav = document.getElementById('bottom-nav');
            const menuView = document.getElementById('menu-view');
            if (!bottomNav) return;
            bottomNav.classList.add('nav-hidden');
            if (menuView) menuView.classList.add('bottom-nav-hidden');
        }

        function showBottomNav(pageId) {
            const bottomNav = document.getElementById('bottom-nav');
            const menuView = document.getElementById('menu-view');
            const showNav = pageId === 'page-topics' || pageId === 'page-repetition' || pageId === 'page-path' || pageId === 'page-account';
            if (!bottomNav) return;
            if (showNav) {
                bottomNav.classList.remove('nav-hidden');
                if (menuView) menuView.classList.remove('bottom-nav-hidden');
            } else {
                hideBottomNav();
            }
        }

        function updateBottomNavVisibility(pageId) {
            const theoryOpen = document.getElementById('theory-view')?.classList.contains('active');
            const lessonOpen = !document.getElementById('lesson-view')?.classList.contains('hidden');
            const setupOpen = document.getElementById('repetition-setup-overlay')?.classList.contains('overlay-visible');
            if (theoryOpen || lessonOpen || setupOpen) {
                hideBottomNav();
                return;
            }
            showBottomNav(pageId);
        }

        let pendingRepetitionTopicId = null;

        function openRepetitionSetup(topicId) {
            const topic = COURSE_DATA.topics.find(t => t.id === topicId);
            if (!topic) return;

            pendingRepetitionTopicId = topicId;
            document.getElementById('rep-setup-title').innerText = topic.title;

            const list = document.getElementById('rep-setup-subtopics');
            list.innerHTML = '';
            topic.subtopics.forEach((st, index) => {
                const row = document.createElement('label');
                row.className = 'repetition-setup-row';
                row.innerHTML = `
                    <span class="repetition-setup-row-text">${st.title}</span>
                    <span class="repetition-setup-checkbox-wrap">
                        <input type="checkbox" class="repetition-setup-checkbox" checked data-index="${index}">
                        <span class="repetition-setup-checkmark"></span>
                    </span>
                `;
                list.appendChild(row);
            });

            const startBtn = document.getElementById('rep-setup-start');
            startBtn.style.backgroundColor = '#be6cf1';
            startBtn.style.boxShadow = `0 4px 0 ${darkenColor('#be6cf1', 20)}`;

            showRepetitionSetupVisuals();
            hideBottomNav();

            if (currentAppState !== 'repetition_setup') {
                history.pushState({ page: 'repetition_setup' }, '');
                currentAppState = 'repetition_setup';
            }
        }

        function showRepetitionSetupVisuals() {
            const overlay = document.getElementById('repetition-setup-overlay');
            overlay.classList.remove('overlay-hidden');
            void overlay.offsetWidth;
            overlay.classList.add('overlay-visible');
        }

        function hideRepetitionSetupVisuals() {
            const overlay = document.getElementById('repetition-setup-overlay');
            overlay.classList.remove('overlay-visible');
            overlay.classList.add('overlay-hidden');
            pendingRepetitionTopicId = null;
        }

        function closeRepetitionSetup(fromPopState = false) {
            const overlay = document.getElementById('repetition-setup-overlay');
            if (overlay.classList.contains('overlay-hidden')) return;

            hideRepetitionSetupVisuals();
            if (!fromPopState && currentAppState === 'repetition_setup') {
                history.back();
            } else {
                showBottomNav(getVisibleMenuPageId());
            }
        }

        function confirmRepetitionSetup() {
            const topic = COURSE_DATA.topics.find(t => t.id === pendingRepetitionTopicId);
            if (!topic) return;

            const selectedIndices = [];
            document.querySelectorAll('.repetition-setup-checkbox').forEach(cb => {
                if (cb.checked) selectedIndices.push(parseInt(cb.dataset.index, 10));
            });

            if (selectedIndices.length === 0) {
                alert('Выберите хотя бы одну подтему!');
                return;
            }

            const tasks = gatherRepetitionTasksFromTopic(topic, REPETITION_TASK_COUNT, selectedIndices);
            if (tasks.length === 0) {
                alert('Не найдено заданий для повторения с выбранными подтемами!');
                return;
            }

            const topicId = pendingRepetitionTopicId;
            hideRepetitionSetupVisuals();
            if (currentAppState === 'repetition_setup') {
                history.replaceState({ page: 'repetition' }, '');
                currentAppState = 'repetition';
            }
            startTopicRepetition(topicId, tasks);
        }

        function updateBottomNavActive(tab) {
            activeMenuTab = tab;
            const homeBtn = document.getElementById('nav-home');
            const repeatBtn = document.getElementById('nav-repeat');
            const accountBtn = document.getElementById('nav-account');
            if (homeBtn) homeBtn.classList.toggle('active', tab === 'topics');
            if (repeatBtn) repeatBtn.classList.toggle('active', tab === 'repetition');
            if (accountBtn) accountBtn.classList.toggle('active', tab === 'account');
        }
        function showMenuPage(pageId, fromPopState = false) {
            ['page-topics', 'page-path', 'page-repetition', 'page-account'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            document.getElementById(pageId).classList.remove('hidden');
            updateBottomNavVisibility(pageId);

            if (pageId === 'page-topics') updateBottomNavActive('topics');
            if (pageId === 'page-path') updateBottomNavActive('topics');
            if (pageId === 'page-repetition') updateBottomNavActive('repetition');
            if (pageId === 'page-account') updateBottomNavActive('account');
        }

        function navigateToMenuTab(tab, fromPopState = false) {
            if (tab === activeMenuTab && !fromPopState) {
                const currentPage = tab === 'topics' ? 'page-topics' : (tab === 'repetition' ? 'page-repetition' : 'page-account');
                if (!document.getElementById(currentPage).classList.contains('hidden')) return;
            }

            if (!fromPopState) {
                const page = tab === 'topics' ? 'topics' : (tab === 'repetition' ? 'repetition' : 'account');
                if (currentAppState !== page && currentAppState !== 'path' && currentAppState !== 'path_popup') {
                    history.pushState({ page: page }, '');
                    currentAppState = page;
                } else if (currentAppState === 'path' || currentAppState === 'path_popup') {
                    history.pushState({ page: page }, '');
                    currentAppState = page;
                    hideLessonPopupVisuals();
                }
            }

            const targetPage = tab === 'topics' ? 'page-topics' : (tab === 'repetition' ? 'page-repetition' : 'page-account');
            if (tab === 'account') {
                renderProgressTable();
                updateAccountUI();
            }
            showMenuPage(targetPage, fromPopState);
            window.scrollTo(0, 0);
        }

        function renderRepetitionTopics() {
            const container = document.getElementById('repetition-topics-container');
            if (!container) return;

            container.innerHTML = '';

            if (COURSE_DATA.topics.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding: 40px; color: #afafaf; font-weight: 700;">Темы ещё не загружены</div>';
                return;
            }

            COURSE_DATA.topics.forEach(topic => {
                const meta = getRepetitionTopicMeta(topic);
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'repetition-card';
                card.innerHTML = `
                    <div class="repetition-card-text">
                        <span class="repetition-card-title">${topic.title}</span>
                        <span class="repetition-card-subtitle">${meta.subtitle}</span>
                    </div>
                    <div class="repetition-card-icon-wrap">${getRepetitionIconSvg(meta.icon)}</div>
                `;
                card.onclick = () => openRepetitionSetup(topic.id);
                container.appendChild(card);
            });
        }

        function startTopicRepetition(topicId, tasks = null) {
            const topic = COURSE_DATA.topics.find(t => t.id === topicId);
            if (!topic) return;

            if (!tasks) {
                tasks = gatherRepetitionTasksFromTopic(topic, REPETITION_TASK_COUNT);
            }
            if (tasks.length === 0) {
                alert('Не найдено заданий для повторения в этой теме!');
                return;
            }

            lessonReturnMenuPage = 'page-repetition';
            savedMenuScrollPosition = window.scrollY || document.documentElement.scrollTop;

            currentTopic = topic;
            currentTopicId = topic.id;
            currentSubtopicIndex = null;
            currentLessonId = 'repetition-' + topic.id;
            currentLesson = {
                title: 'Повторение',
                path: topic.title + ' · Повторение',
                tasks: tasks,
                isRepetition: true
            };

            lessonCompleted = false;
            if (currentAppState !== 'repetition') {
                history.pushState({ page: 'repetition' }, '');
                currentAppState = 'repetition';
            }
            history.pushState({ page: 'lesson' }, '');
            currentAppState = 'lesson';
            lessonStartTime = Date.now();
            lessonErrors = 0;
            currentTaskIndex = 0;

            const csWrapper = document.getElementById('cheat-sheet-wrapper');
            if (csWrapper) csWrapper.style.display = 'flex';

            document.getElementById('generator-controls').style.display = 'none';
            loadTask();

            const menuView = document.getElementById('menu-view');
            const lessonView = document.getElementById('lesson-view');
            const bottomNav = document.getElementById('bottom-nav');
            hideBottomNav();

            menuView.style.animation = 'viewFadeOut 0.3s forwards';
            setTimeout(() => {
                menuView.classList.add('hidden');
                menuView.style.animation = '';

                lessonView.classList.remove('hidden');
                lessonView.style.animation = 'viewFadeIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
                window.scrollTo(0, 0);
            }, 250);
        }

        function openTopic(topicId, subtopicIndex) {
            currentTopicId = topicId;
            currentSubtopicIndex = subtopicIndex;
            const topic = COURSE_DATA.topics.find(t => t.id === topicId);
currentTopicBaseId = topic.baseId;
            const subtopic = topic.subtopics[subtopicIndex];
            
            const pathHeaderBlock = document.getElementById('path-header-block');
            pathHeaderBlock.style.backgroundColor = topic.color;
            pathHeaderBlock.style.borderColor = topic.color;
            pathHeaderBlock.style.boxShadow = `0 4px 0 ${darkenColor(topic.color, 20)}`;
            
            const pathTitle = document.getElementById('path-title');
            pathTitle.innerText = subtopic.title;

            const theoryBtn = document.getElementById('btn-topic-theory');
            const theoryDivider = document.getElementById('path-theory-divider');
            if (topic.theory || subtopic.theory) {
                theoryBtn.classList.remove('hidden');
                theoryDivider.classList.remove('hidden');
            } else {
                theoryBtn.classList.add('hidden');
                theoryDivider.classList.add('hidden');
            }

            const pathContainer = document.getElementById('path-container');
            pathContainer.innerHTML = '';

            let displayCounter = 1;
          subtopic.levels.forEach((level, index) => {
    const lessonId = typeof level === 'object' ? level.lessonId : level;
    const lesson = COURSE_DATA.lessons[lessonId];
    
    const btn = document.createElement('button');
    btn.className = 'level-circle';
    btn.dataset.lessonId = lessonId;

    const numberSpan = document.createElement('span');
    numberSpan.className = 'level-number-text';
    
    if (lesson && lesson.isTest) {
        numberSpan.innerText = 'КР';
        numberSpan.style.fontSize = '28px';
        numberSpan.style.fontWeight = '900';
    } else if (lesson && lesson.isRepetition) {
        numberSpan.innerHTML = '&#8635;';
        numberSpan.style.fontSize = '40px';
        numberSpan.style.fontWeight = '900';
        numberSpan.style.lineHeight = '1';
    } else if (lesson && lesson.isGenerator) {
        numberSpan.innerText = 'ГЕН';
        numberSpan.style.fontSize = '20px';
        numberSpan.style.fontWeight = '900';
    } else {
        numberSpan.innerText = displayCounter++;
    }
    btn.appendChild(numberSpan);

    const shadowColor = darkenColor(topic.color, 20);
    btn.style.backgroundColor = topic.color;
    btn.style.setProperty('--shadow-color', shadowColor);

    const isRegularLesson = !(lesson && (lesson.isTest || lesson.isRepetition || lesson.isGenerator));
    const isCompleted = isRegularLesson && topic.baseId && userProgress[topic.baseId] &&
        userProgress[topic.baseId][lessonId] && userProgress[topic.baseId][lessonId].completed;

    if (isCompleted) {
        renderLevelCircleCheckmark(btn, false);
        numberSpan.style.display = 'none';
    }
    
    btn.onclick = (e) => showLessonPopup(e, lessonId, btn, topic.color, subtopic.title);
    
    pathContainer.appendChild(btn);
});

            navigateMenu('page-path');
        }

        let activeLessonPopup = null;

        function showLessonPopup(e, lessonId, btn, topicColor, topicTitle) {
            e.stopPropagation();
            const popup = document.getElementById('lesson-popup');
            const lesson = COURSE_DATA.lessons[lessonId];
            
            if (!lesson) return;

            document.getElementById('lesson-popup-title').innerText = lesson.title || 'Урок';
            
            let tasksCount = 0;
            if (lesson.isRepetition) {
                tasksCount = lesson.tasksToGather || 0;
            } else {
                tasksCount = lesson.tasks ? lesson.tasks.length : 0;
            }
            
            let taskWord = "заданий";
            if (tasksCount % 10 === 1 && tasksCount % 100 !== 11) taskWord = "задание";
            else if ([2,3,4].includes(tasksCount % 10) && ![12,13,14].includes(tasksCount % 100)) taskWord = "задания";
            
            document.getElementById('lesson-popup-tasks').innerText = `${tasksCount} ${taskWord}`;
            
            const startBtn = document.getElementById('lesson-popup-start');
            startBtn.style.backgroundColor = topicColor;
            startBtn.style.boxShadow = `0 4px 0 ${darkenColor(topicColor, 20)}`;
            
            startBtn.onclick = () => {
                const popup = document.getElementById('lesson-popup');
                if (popup.classList.contains('popup-hidden')) return;
                
            	hideLessonPopupVisuals();
                if (currentAppState === 'path_popup') {
                    history.back(); // Pop the path_popup state
                    setTimeout(() => {
                        startLesson(lessonId);
                    }, 10);
                } else {
                    startLesson(lessonId);
                }
            };

            // Позиционируем попап над кнопкой
            const rect = btn.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            
            popup.style.top = `${rect.top + scrollTop}px`;
            popup.style.left = `${rect.left + scrollLeft + rect.width / 2}px`;
            
            // Force reflow to ensure the transition plays when removing popup-hidden
            void popup.offsetWidth;
            
            popup.classList.remove('popup-hidden');
            activeLessonPopup = popup;

            if (currentAppState !== 'path_popup') {
                history.pushState({ page: 'path_popup' }, '');
                currentAppState = 'path_popup';
            }
        }

        function hideLessonPopupVisuals() {
            const popup = document.getElementById('lesson-popup');
            if (popup && !popup.classList.contains('popup-hidden')) {
                popup.classList.add('popup-hidden');
            }
        }

        // Закрытие попапа при клике вне его
        document.addEventListener('click', (e) => {
            const popup = document.getElementById('lesson-popup');
            if (popup && !popup.classList.contains('popup-hidden') && !popup.contains(e.target)) {
                hideLessonPopupVisuals();
                if (currentAppState === 'path_popup') {
                    history.back();
                }
            }
        });

        function startLesson(lessonId) {
            lessonCompleted = false;
            lessonReturnMenuPage = 'page-path';
            history.pushState({ page: 'lesson' }, '');
            currentAppState = 'lesson';
            lessonStartTime = Date.now();
            lessonErrors = 0;
currentLessonFailedTasks = [];
            currentLessonId = lessonId;
            currentLesson = COURSE_DATA.lessons[lessonId];
            if (!currentLesson) {
                alert("Ошибка! Урок не найден в базе данных.");
                return;
            }
            
            currentTopic = null;
            currentTopicId = null;
            currentSubtopicIndex = null;
            for (const t of COURSE_DATA.topics) {
                for (let i = 0; i < t.subtopics.length; i++) {
                    const st = t.subtopics[i];
                    if (st.levels.some(l => (typeof l === 'object' ? l.lessonId : l) == lessonId)) {
                        currentTopic = t;
                        currentTopicId = t.id;
                        currentSubtopicIndex = i;
                        break;
                    }
                }
                if (currentTopic) break;
            }

            // Управление видимостью шпаргалок
            const csWrapper = document.getElementById('cheat-sheet-wrapper');
            if (csWrapper) {
                if (currentLesson.disableCheatSheet) {
                    csWrapper.style.display = 'none';
                } else {
                    csWrapper.style.display = 'flex';
                }
            }

            const genControls = document.getElementById('generator-controls');
            if (currentLesson.isGenerator) {
                genControls.style.display = 'flex';
                const chaosLevel = parseInt(document.getElementById('chaos-level').value) || 2;
                currentLesson.tasks = generateTasks(currentLesson, chaosLevel, 1);
            } else {
                genControls.style.display = 'none';
            }

            if (currentLesson.isRepetition && currentLessonId && !String(currentLessonId).startsWith('repetition-')) {
                let parentTopic = null;
                for (const t of COURSE_DATA.topics) {
                    for (const st of t.subtopics) {
                        if (st.levels.some(l => (typeof l === 'object' ? l.lessonId : l) == lessonId)) {
                            parentTopic = t;
                            break;
                        }
                    }
                    if (parentTopic) break;
                }

                if (parentTopic) {
                    const count = currentLesson.tasksToGather || 5;
                    currentLesson.tasks = gatherRepetitionTasksFromTopic(parentTopic, count);

                    if (currentLesson.tasks.length === 0) {
                        alert("Не найдено заданий для повторения!");
                        return;
                    }
                }
            }

            currentTaskIndex = 0;
            loadTask();

            savedPathScrollPosition = window.scrollY || document.documentElement.scrollTop;

            const menuView = document.getElementById('menu-view');
            const lessonView = document.getElementById('lesson-view');
            const bottomNav = document.getElementById('bottom-nav');
            hideBottomNav();
            
            menuView.style.animation = 'viewFadeOut 0.3s forwards';
            setTimeout(() => {
                menuView.classList.add('hidden');
                menuView.style.animation = '';
                
                lessonView.classList.remove('hidden');
                lessonView.style.animation = 'viewFadeIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
                window.scrollTo(0, 0);
            }, 250);
        }

        function regenerateTasks() {
            if (!currentLesson || !currentLesson.isGenerator) return;
            const chaosLevel = parseInt(document.getElementById('chaos-level').value) || 2;
            currentLesson.tasks = generateTasks(currentLesson, chaosLevel, 1);
            currentTaskIndex = 0;
            loadTask();
        }

        function generateTasks(lesson, chaosLevel, tasksCount = 1) {
            const maxVal = chaosLevel * 10;
            const formulasStr = lesson.generatorFormulas || "";
            const formulas = formulasStr.split(' ИЛИ ').map(s => s.trim());
            const explanations = lesson.generatorExplanations || [];
            
            const tasks = [];
            
            for (let i = 0; i < tasksCount; i++) {
                const formulaIndex = Math.floor(Math.random() * formulas.length);
                const formula = formulas[formulaIndex];
                const parts = formula.split('=');
                const leftSide = parts[0].trim();
                const rightSide = parts[1] ? parts[1].trim() : "0";
                
                const cleanStr = formula.replace(/\\[a-zA-Z]+/g, '');
                const varsMatch = cleanStr.match(/[a-zA-Z]/g) || [];
                const vars = [...new Set(varsMatch)];
                
                let bestVars = {};
                let bestAnswer = 0;
                let found = false;
                
                for (let attempt = 0; attempt < 1000; attempt++) {
                    let currentVars = {};
                    vars.forEach(v => {
                        currentVars[v] = Math.floor(Math.random() * maxVal) + 1;
                    });
                    
                    let evalStr = rightSide;
                    evalStr = evalStr.replace(/\\frac{([^{}]+)}{([^{}]+)}/g, "($1)/($2)");
                    evalStr = evalStr.replace(/\\cdot/g, "*");
                    evalStr = evalStr.replace(/:/g, "/");
                    
                    vars.forEach(v => {
                        const regex = new RegExp(`\\b${v}\\b`, 'g');
                        evalStr = evalStr.replace(regex, currentVars[v]);
                    });
                    
                    try {
                        const ans = eval(evalStr);
                        if (isFinite(ans) && Math.abs(ans * 100 - Math.round(ans * 100)) < 0.0001) {
                            bestVars = currentVars;
                            bestAnswer = Math.round(ans * 100) / 100;
                            found = true;
                            break;
                        }
                    } catch (e) {}
                }
                
                if (!found) {
                    vars.forEach(v => bestVars[v] = 2);
                    bestAnswer = 1;
                }
                
                let taskText = leftSide;
                vars.forEach(v => {
                    const regex = new RegExp(`\\b${v}\\b`, 'g');
                    taskText = taskText.replace(regex, bestVars[v]);
                });
                
                let explanationStr = "";
                if (explanations && explanations.length > formulaIndex) {
                    explanationStr = explanations[formulaIndex];
                } else {
                    explanationStr = lesson.generatorExplanation || "Объяснение генератора.";
                }
                
                let explParts = explanationStr.split(';').map(s => s.trim()).filter(s => s.length > 0);
                let explanationFields = explParts;
                
                tasks.push({
                    type: "input",
                    text: `Вычислите:<br>\\[ ${taskText} \\]`,
                    correctAnswer: bestAnswer.toString(),
                    explanationFields: explanationFields,
                    isOge: lesson.isOge || false
                });
            }
            return tasks;
        }

        function loadTask() {
            document.getElementById('l-main').scrollTop = 0;
            const task = currentLesson.tasks[currentTaskIndex];

            // Заголовок и путь
            const taskCountText = currentLesson.isGenerator ? ` (Задание ${currentTaskIndex + 1})` : (currentLesson.tasks.length > 1 ? ` (Задание ${currentTaskIndex + 1} из ${currentLesson.tasks.length})` : '');
            document.getElementById('l-path').innerText = currentLesson.path + taskCountText;
            document.getElementById('l-title').innerText = currentLesson.title;

            // Динамическая генерация текста и кода
            const bubble = document.getElementById('l-example-bubble');
            bubble.innerHTML = '';

            if (task.isOge) {
                const ogeLabel = document.createElement('div');
                ogeLabel.className = 'oge-label';
                ogeLabel.innerText = 'задача из ОГЭ';
                bubble.appendChild(ogeLabel);
            }

            for (const key in task) {
                if (key.startsWith('text')) {
                    const textVal = task[key];
                    if (textVal && textVal.trim() !== "") {
                        const div = document.createElement('div');
                        div.className = 'task-text-block';
                        div.innerHTML = autoWrapMath(textVal);
                        bubble.appendChild(div);
                    }
                } else if (key.startsWith('code')) {
                    const codeVal = task[key];
                    if (codeVal && codeVal.trim() !== "") {
                        const div = document.createElement('div');
                        div.className = 'code-box';
                        let codeText = codeVal.trim();
                        codeText = codeText.replace(/^\$+/, '').replace(/\$+$/, '').trim();
                        if (!codeText.startsWith('\\[')) {
                            codeText = `\\[ ${codeText} \\]`;
                        }
                        div.innerHTML = codeText.replace(/\n/g, '<br>');
                        bubble.appendChild(div);
                    }
                }
            }

            // Сброс полей
            const lAnswer = document.getElementById('l-answer');
            const lDraft = document.getElementById('l-draft');
            const lAnswerContainer = document.getElementById('l-answer-container');
            const lDraftContainer = document.getElementById('l-draft-container');
            
            lAnswer.value = '';
            lAnswer.disabled = false;
            lDraft.value = '';
            
            resetErrorState();

            const btnCheck = document.getElementById('btn-check');
            const btnNext = document.getElementById('btn-next');

            if (!task.correctAnswer || task.correctAnswer.trim() === "") {
                // Режим теории (нет правильного ответа)
                lDraftContainer.style.display = 'none';
                lAnswerContainer.style.display = 'none';
                btnCheck.classList.add('hidden');
                btnNext.classList.remove('hidden');
                document.getElementById('btn-next-text').innerText = 'Понятно';
            } else {
                // Режим практики
                lDraftContainer.style.display = '';
                lAnswerContainer.style.display = '';
                document.getElementById('btn-next-text').innerText = 'Дальше';
            }

            const footerButtons = document.getElementById('footer-buttons');
            const showTheoryBtn = task.hasTheory !== undefined ? task.hasTheory : currentLesson.hasTheory;
            if (showTheoryBtn) {
                footerButtons.classList.add('has-theory');
            } else {
                footerButtons.classList.remove('has-theory');
            }

            // Перезапуск анимаций
            const mainContent = document.getElementById('l-main');
            mainContent.style.display = 'none';
            mainContent.offsetHeight;
            mainContent.style.display = 'flex';

            // Рендерим MathJax для текста задания
            if (window.MathJax) {
                MathJax.typesetPromise([document.getElementById('l-example-bubble')]).catch((err) => console.log(err.message));
            }
        }

        function confirmCloseLesson() {
            const fromPage = lessonReturnMenuPage === 'page-repetition' ? 'repetition' : 'lesson';
            history.pushState({ page: 'exit_modal', from: fromPage }, '');
            currentAppState = 'exit_modal';
            showExitModalVisuals();
        }

        function closeExitConfirmModal() {
            if (currentAppState === 'exit_modal') {
                history.back();
            } else {
                hideExitModalVisuals();
            }
        }

        function confirmExitYes() {
            if (currentAppState === 'exit_modal') {
                isProgrammaticBack = true;
                const stateFrom = history.state ? history.state.from : null;
                if (stateFrom === 'lesson' || stateFrom === 'repetition') {
                    history.go(-2);
                } else {
                    history.back();
                }
            } else {
                hideExitModalVisuals();
                setTimeout(() => {
                    actuallyCloseLesson();
                }, 300);
            }
        }

        function showCompletionModal() {
            lessonCompleted = true;
markLessonComplete(currentTopicBaseId, currentLessonId, currentLessonFailedTasks);
          justCompletedLessonId = currentLessonId;
            const timeSpent = Math.floor((Date.now() - lessonStartTime) / 1000);
            const minutes = Math.floor(timeSpent / 60);
            const seconds = timeSpent % 60;
            const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            document.getElementById('comp-errors').innerText = lessonErrors;
            document.getElementById('comp-time').innerText = timeString;
            
            const overlay = document.getElementById('completion-modal-overlay');
            const content = document.getElementById('completion-modal-content');
            overlay.classList.remove('hidden');
            // Force reflow
            void overlay.offsetWidth;
            overlay.style.opacity = '1';
            content.style.transform = 'scale(1)';
        }

        function closeCompletionModal() {
            const overlay = document.getElementById('completion-modal-overlay');
            const content = document.getElementById('completion-modal-content');
            overlay.style.opacity = '0';
            content.style.transform = 'scale(0.9)';
            setTimeout(() => {
                overlay.classList.add('hidden');
                if (currentAppState === 'lesson') {
                    history.back();
                } else {
                    actuallyCloseLesson();
                }
            }, 300);
        }

        function actuallyCloseLesson() {
            closeCheatSheet();
            const menuView = document.getElementById('menu-view');
            const lessonView = document.getElementById('lesson-view');
            
            document.getElementById('lesson-dropdown').classList.add('hidden');
            
            lessonView.style.animation = 'viewFadeOut 0.3s forwards';
            setTimeout(() => {
                lessonView.classList.add('hidden');
                lessonView.style.animation = '';
                
                menuView.classList.remove('hidden');
                menuView.style.animation = 'viewFadeIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

                showMenuPage(lessonReturnMenuPage);
                if (lessonReturnMenuPage === 'page-repetition') {
                    currentAppState = 'repetition';
                    window.scrollTo(0, savedMenuScrollPosition);
                } else if (lessonReturnMenuPage === 'page-path') {
                    currentAppState = 'path';
                    window.scrollTo(0, savedPathScrollPosition);
                    animateJustCompletedLesson();
                } else {
                    currentAppState = 'topics';
                    window.scrollTo(0, savedMenuScrollPosition);
                }
            }, 250);
        }

        function openTheory(event) {
            if (event) {
                event.stopPropagation();
            }
            
            const task = currentLesson.tasks[currentTaskIndex];
            const showTheoryBtn = task && task.hasTheory !== undefined ? task.hasTheory : currentLesson.hasTheory;
            
            let subtopicTheory = null;
            if (currentTopic && currentSubtopicIndex !== null && currentTopic.subtopics[currentSubtopicIndex]) {
                subtopicTheory = currentTopic.subtopics[currentSubtopicIndex].theory;
            }
            
            const theory = (currentLesson && currentLesson.theory) || subtopicTheory || (currentTopic && currentTopic.theory);
            
            if (!currentLesson || !showTheoryBtn || !theory) return;
            
            document.getElementById('t-title').innerText = currentLesson.title;
            
            const bubble = document.getElementById('t-example-bubble');
            bubble.innerHTML = '';
            
            for (const key in theory) {
                if (key.startsWith('text')) {
                    const textVal = theory[key];
                    if (textVal && textVal.trim() !== "") {
                        const div = document.createElement('div');
                        div.className = 'task-text-block';
                        div.innerHTML = autoWrapMath(textVal);
                        bubble.appendChild(div);
                    }
                } else if (key.startsWith('code')) {
                    const codeVal = theory[key];
                    if (codeVal && codeVal.trim() !== "") {
                        const div = document.createElement('div');
                        div.className = 'code-box';
                        let codeText = codeVal.trim();
                        codeText = codeText.replace(/^\$+/, '').replace(/\$+$/, '').trim();
                        if (!codeText.startsWith('\\[')) {
                            codeText = `\\[ ${codeText} \\]`;
                        }
                        div.innerHTML = codeText.replace(/\n/g, '<br>');
                        bubble.appendChild(div);
                    }
                }
            }
            
            document.getElementById('theory-view').classList.add('active');
            hideBottomNav();
            
            if (currentAppState !== 'theory') {
                history.pushState({ page: 'theory' }, '');
                currentAppState = 'theory';
            }
            
            if (window.MathJax) {
                MathJax.typesetPromise([document.getElementById('t-example-bubble')]).catch((err) => console.log(err.message));
            }
        }

        function openTopicTheory() {
            if (currentTopicId === null || currentSubtopicIndex === null) return;
            
            const topic = COURSE_DATA.topics.find(t => t.id === currentTopicId);
            const subtopic = topic.subtopics[currentSubtopicIndex];
            
            const theory = subtopic.theory || topic.theory;
            if (!theory) return;
            
            document.getElementById('t-title').innerText = (subtopic.theory ? subtopic.title : topic.title);
            
            const bubble = document.getElementById('t-example-bubble');
            bubble.innerHTML = '';
            
            for (const key in theory) {
                if (key.startsWith('text')) {
                    const textVal = theory[key];
                    if (textVal && textVal.trim() !== "") {
                        const div = document.createElement('div');
                        div.className = 'task-text-block';
                        div.innerHTML = autoWrapMath(textVal);
                        bubble.appendChild(div);
                    }
                } else if (key.startsWith('code')) {
                    const codeVal = theory[key];
                    if (codeVal && codeVal.trim() !== "") {
                        const div = document.createElement('div');
                        div.className = 'code-box';
                        let codeText = codeVal.trim();
                        codeText = codeText.replace(/^\$+/, '').replace(/\$+$/, '').trim();
                        if (!codeText.startsWith('\\[')) {
                            codeText = `\\[ ${codeText} \\]`;
                        }
                        div.innerHTML = codeText.replace(/\n/g, '<br>');
                        bubble.appendChild(div);
                    }
                }
            }
            
            if (window.MathJax) {
                MathJax.typesetPromise([document.getElementById('t-example-bubble')]).catch((err) => console.log(err.message));
            }
            
            document.getElementById('theory-view').classList.add('active');
            hideBottomNav();
            
            if (currentAppState !== 'theory') {
                history.pushState({ page: 'theory' }, '');
                currentAppState = 'theory';
            }
        }

        function closeTheory() {
            const theoryView = document.getElementById('theory-view');
            if (!theoryView.classList.contains('active')) return;
            
            theoryView.classList.remove('active');
            const lessonOpen = !document.getElementById('lesson-view').classList.contains('hidden');
            if (!lessonOpen) {
                showBottomNav(getVisibleMenuPageId());
            }
            if (currentAppState === 'theory') {
                history.back();
            }
        }

        function toggleLessonMenu() {
            const dropdown = document.getElementById('lesson-dropdown');
            if (dropdown.classList.contains('hidden')) {
                document.getElementById('ld-title').innerText = currentLesson.title;
                document.getElementById('ld-progress').innerText = currentLesson.isGenerator ? `Задание ${currentTaskIndex + 1}` : `Задание ${currentTaskIndex + 1} из ${currentLesson.tasks.length}`;
                document.getElementById('ld-code').innerText = currentLessonId;
                dropdown.classList.remove('hidden');
                
                if (currentAppState !== 'lesson_dropdown') {
                    history.pushState({ page: 'lesson_dropdown' }, '');
                    currentAppState = 'lesson_dropdown';
                }
            } else {
                dropdown.classList.add('hidden');
                if (currentAppState === 'lesson_dropdown') {
                    history.back();
                }
            }
        }

        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('lesson-dropdown');
            const menuBtn = document.querySelector('.lesson-menu-btn');
            if (dropdown && !dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && e.target !== menuBtn) {
                dropdown.classList.add('hidden');
                if (currentAppState === 'lesson_dropdown') {
                    history.back();
                }
            }
        });

        function showReportModal() {
            document.getElementById('lesson-dropdown').classList.add('hidden');
            document.getElementById('report-lesson-code').innerText = currentLessonId;
            document.getElementById('report-modal-overlay').classList.remove('hidden');
            
            if (currentAppState !== 'report_modal') {
                history.pushState({ page: 'report_modal' }, '');
                currentAppState = 'report_modal';
            }
        }

        function closeReportModal() {
            const overlay = document.getElementById('report-modal-overlay');
            if (overlay.classList.contains('hidden')) return;
            
            overlay.classList.add('hidden');
            if (currentAppState === 'report_modal') {
                history.back();
            }
        }

        function goToReportForm() {
            window.open('https://docs.google.com/forms/d/e/1FAIpQLSe9asK8LpTdcIIzj6oqX0HRHvxe-o2qU6Gfu1mG4CuaZLzj6A/viewform', '_blank');
            closeReportModal();
        }

        function resetErrorState() {
            const lAnswer = document.getElementById('l-answer');
            lAnswer.style.borderColor = '';
            lAnswer.style.backgroundColor = '';
            lAnswer.style.color = '';
            
            const footer = document.getElementById('l-footer');
            footer.className = 'lesson-footer';
            document.getElementById('l-feedback-area').style.display = 'none';
            document.getElementById('cheat-sheet-wrapper')?.classList.remove('hidden-by-footer');
            
            document.getElementById('btn-check').classList.remove('hidden');
            document.getElementById('btn-next').classList.add('hidden');
            document.getElementById('btn-retry').classList.add('hidden');
            document.getElementById('btn-explain').classList.add('hidden');
            document.getElementById('btn-close-explain').classList.add('hidden');
        }

        function animateFooterOpen(isSuccess, setupContentCallback) {
            const footer = document.getElementById('l-footer');
            document.getElementById('cheat-sheet-wrapper')?.classList.add('hidden-by-footer');
            
            // 1. Фиксируем текущую высоту
            const startHeight = footer.offsetHeight;
            
            // Отключаем транзиции для мгновенного измерения
            footer.style.transition = 'none';
            
            // 2. Выполняем коллбэк для подмены контента (он покажет фидбек и нужные кнопки)
            setupContentCallback();
            
            // 3. Измеряем новую целевую высоту
            const targetHeight = footer.offsetHeight;
            
            // 4. Возвращаем старую высоту и готовимся к анимации
            footer.style.height = startHeight + 'px';
            void footer.offsetHeight; // force reflow
            
            // 5. Запускаем анимацию высоты и цвета фона
            footer.style.transition = 'height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.3s ease';
            footer.style.height = targetHeight + 'px';
            
            setTimeout(() => {
                footer.style.height = '';
                footer.style.transition = '';
            }, 400);
        }

        function autoWrapMath(str) {
            if (!str || typeof str !== 'string') return str;
            if (str.includes('$') || str.includes('\\[') || str.includes('\\(')) return str;
            
            if (/[\\\^_]/.test(str) && !/[а-яА-ЯёЁ]/.test(str)) {
                return `\\( ${str} \\)`;
            }
            
            if (/[\\\^_]/.test(str)) {
                return str.replace(/([a-zA-Z0-9+\-*/=<>()[\]{}\\^_.!|,\s]+)/g, function(match) {
                    if (/[\\\^_]/.test(match)) {
                        let trimmed = match.trim();
                        if (trimmed) {
                            return match.replace(trimmed, `\\( ${trimmed} \\)`);
                        }
                    }
                    return match;
                });
            }
            
            return str;
        }

        function checkAnswer() {
            closeMathKeyboard(); // Закрываем клавиатуру при проверке

            const task = currentLesson.tasks[currentTaskIndex];
            const lAnswer = document.getElementById('l-answer');
            
            function normalizeMath(str) {
                if (!str) return "";
                let s = str.replace(/\s+/g, '').toLowerCase();
                
                // Заменяем запятые на точки для унификации десятичных дробей
                s = s.replace(/,/g, '.');
                
                // Исправляем частую ошибку, когда в JSON забывают экранировать слеш (sqrt вместо \sqrt)
                s = s.replace(/(^|[^\\])sqrt/g, '$1\\sqrt');
                s = s.replace(/(^|[^\\])frac/g, '$1\\frac');
                s = s.replace(/(^|[^\\])pi/g, '$1\\pi');
                s = s.replace(/(^|[^\\])cdot/g, '$1\\cdot');
                
                s = s.replace(/\\frac(\d)(\d)/g, '\\frac{$1}{$2}'); // \frac14 -> \frac{1}{4}
                s = s.replace(/\\sqrt(\d)(?!\d)/g, '\\sqrt{$1}'); // \sqrt7 -> \sqrt{7}
                s = s.replace(/²/g, '^2');
                s = s.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}'); // √(...)
                s = s.replace(/√(\d+)/g, '\\sqrt{$1}');       // √25
                s = s.replace(/×/g, '\\cdot');
                s = s.replace(/\\times/g, '\\cdot');
                s = s.replace(/÷/g, '\\div');
                s = s.replace(/≤/g, '\\le');
                s = s.replace(/≥/g, '\\ge');
                s = s.replace(/≠/g, '\\neq');
                s = s.replace(/≈/g, '\\approx');
                s = s.replace(/±/g, '\\pm');
                s = s.replace(/∞/g, '\\infty');
                s = s.replace(/∈/g, '\\in');
                s = s.replace(/∪/g, '\\cup');
                s = s.replace(/∩/g, '\\cap');
                s = s.replace(/([a-zA-Z0-9]+)\/([a-zA-Z0-9]+)/g, '\\frac{$1}{$2}'); // 1/4 -> \frac{1}{4}
                
                // Удаляем \cdot перед корнями, переменными и пи (6\cdot\sqrt{7} == 6\sqrt{7})
                s = s.replace(/\\cdot(?=\\sqrt|\\pi|[a-z])/g, '');
                
                // Удаляем \left и \right, так как они не влияют на математический смысл
                s = s.replace(/\\left/g, '');
                s = s.replace(/\\right/g, '');
                s = s.replace(/\\mleft/g, '');
                s = s.replace(/\\mright/g, '');
                
                return s;
            }

            let normalizedAnswer = normalizeMath(lAnswer.value);
            let normalizedCorrect = normalizeMath(task.correctAnswer);
            
            const footer = document.getElementById('l-footer');

            // Задержка для анимации закрытия клавиатуры
            setTimeout(() => {
                const isSuccess = (normalizedAnswer === normalizedCorrect);
                if (!isSuccess) {
    lessonErrors++;
    const taskNum = currentTaskIndex + 1;
    if (!currentLessonFailedTasks.includes(taskNum)) {
        currentLessonFailedTasks.push(taskNum);
    }
}
                
                animateFooterOpen(isSuccess, () => {
                    if(isSuccess) {
                        // Успех
                        footer.className = 'lesson-footer state-success';
                        document.getElementById('l-feedback-area').style.display = 'flex';
                        document.getElementById('l-feedback-title').innerHTML = '<span>✔</span> Отлично!';
                        document.getElementById('l-feedback-explanation').innerHTML = ''; 
                        
                        document.getElementById('btn-check').classList.add('hidden');
                        document.getElementById('btn-next').classList.remove('hidden');
                        document.getElementById('btn-explain').classList.remove('hidden'); // Кнопка объяснения при успехе
                        
                        lAnswer.style.borderColor = "var(--success-color)";
                        lAnswer.style.backgroundColor = "var(--success-bg)";
                        lAnswer.style.color = "var(--success-shadow)";
                        lAnswer.disabled = true;
                    } else {
                        // Ошибка
                        footer.className = 'lesson-footer state-error';
                        document.getElementById('l-feedback-area').style.display = 'flex';
                        document.getElementById('l-feedback-title').innerHTML = '<span>✖</span> Неверно!';
                        document.getElementById('l-feedback-explanation').innerHTML = '';
                        
                        document.getElementById('btn-check').classList.add('hidden');
                        document.getElementById('btn-retry').classList.remove('hidden');
                        document.getElementById('btn-explain').classList.remove('hidden');
                        
                        lAnswer.style.borderColor = "var(--error-color)";
                        lAnswer.style.color = "var(--error-color)";
                        
                        lAnswer.classList.remove('shake');
                        void lAnswer.offsetWidth;
                        lAnswer.classList.add('shake');
                    }
                });
            }, 300);
        }

        function animateFooterClose(callback) {
            const footer = document.getElementById('l-footer');
            const footerContent = footer.querySelector('.footer-content');
            
            if (!footer.classList.contains('state-success') && !footer.classList.contains('state-error')) {
                callback();
                return;
            }

            // 1. Фиксируем высоту
            const startHeight = footer.offsetHeight;
            footer.style.height = startHeight + 'px';
            
            // 2. Прячем контент (текст фидбека и кнопки)
            footerContent.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
            footerContent.style.opacity = '0';
            footerContent.style.transform = 'translateY(10px)';
            
            setTimeout(() => {
                // 3. Выполняем коллбэк (он поменяет классы футера, скроет фидбек, покажет кнопку Проверить)
                callback();
                
                // 4. Измеряем новую высоту (уже без state-success/error)
                footer.style.height = '';
                const targetHeight = footer.offsetHeight;
                
                // 5. Анимируем высоту и цвет фона
                footer.style.height = startHeight + 'px';
                void footer.offsetHeight; // force reflow
                
                footer.style.transition = 'height 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.3s ease';
                footer.style.height = targetHeight + 'px';
                
                // 6. Показываем новый контент (кнопку Проверить)
                footerContent.style.transform = 'translateY(-10px)';
                void footerContent.offsetHeight; // force reflow
                
                footerContent.style.transition = 'opacity 0.2s ease 0.1s, transform 0.2s ease 0.1s';
                footerContent.style.opacity = '1';
                footerContent.style.transform = 'translateY(0)';
                
                setTimeout(() => {
                    footer.style.height = '';
                    footer.style.transition = '';
                    footerContent.style.transition = '';
                    footerContent.style.transform = '';
                }, 300);
                
            }, 150);
        }

        function nextTask() {
            const footer = document.getElementById('l-footer');
            
            if (currentLesson.isGenerator) {
                const chaosLevel = parseInt(document.getElementById('chaos-level').value) || 2;
                const newTasks = generateTasks(currentLesson, chaosLevel, 1);
                currentLesson.tasks.push(newTasks[0]);
            }
            
            if (currentTaskIndex + 1 < currentLesson.tasks.length) {
                if (footer.classList.contains('state-success') || footer.classList.contains('state-error')) {
                    animateFooterClose(() => {
                        currentTaskIndex++;
                        loadTask();
                    });
                } else {
                    currentTaskIndex++;
                    loadTask();
                }
            } else {
                currentTaskIndex++;
                showCompletionModal();
            }
        }

        function retryTask() {
            animateFooterClose(() => {
                const lAnswer = document.getElementById('l-answer');
                lAnswer.value = '';
                lAnswer.disabled = false;
                resetErrorState();
                // Фокус убран, чтобы клавиатура не открывалась автоматически
            });
        }

        function showExplanation() {
            const footer = document.getElementById('l-footer');
            const footerContent = footer.querySelector('.footer-content');
            
            // Плавное исчезновение старого контента
            footerContent.style.transition = 'opacity 0.15s ease';
            footerContent.style.opacity = '0';
            
            setTimeout(() => {
                // Фиксируем текущую высоту для плавного старта
                const startHeight = footer.offsetHeight;
                footer.style.height = startHeight + 'px';
                
                // Force reflow
                void footer.offsetHeight;
                
                footer.classList.add('explanation-mode'); // Добавляем класс, сохраняя state-success или state-error
                
                const feedbackTitle = document.getElementById('l-feedback-title');
                // Сброс стилей на случай, если они остались от закрытия
                feedbackTitle.style.transition = '';
                feedbackTitle.style.opacity = '';
                feedbackTitle.style.animation = '';
                feedbackTitle.style.transform = '';
                feedbackTitle.innerHTML = '💡 Объяснение';
                
                const task = currentLesson.tasks[currentTaskIndex];
                const expContainer = document.getElementById('l-feedback-explanation');
                expContainer.style.display = '';
                expContainer.style.opacity = '';
                expContainer.innerHTML = '';
                
                let fieldsArray = task.explanationFields || (task.explanation ? [task.explanation] : ["Объяснение отсутствует."]);
                let delayCount = fieldsArray.length;
                
                fieldsArray.forEach((text, index) => {
                    const div = document.createElement('div');
                    div.className = 'explanation-field';
                    div.innerHTML = autoWrapMath(text); // Используем innerHTML для поддержки LaTeX
                    div.style.animationDelay = `${index * 0.1}s`; // Плавное появление по очереди
                    expContainer.appendChild(div);
                });
                
                if (task.correctAnswer && task.correctAnswer.trim() !== "") {
                    const div = document.createElement('div');
                    div.className = 'explanation-field explanation-correct-answer';
                    let ca = task.correctAnswer;
                    if (!ca.includes('$') && !ca.includes('\\(') && !ca.includes('\\[')) {
                        ca = `\\( ${ca} \\)`;
                    }
                    div.innerHTML = `Правильный ответ: ${ca}`;
                    div.style.animationDelay = `${delayCount * 0.1}s`;
                    expContainer.appendChild(div);
                    delayCount++;
                }
                
                // Рендерим MathJax для текста объяснения
                if (window.MathJax) {
                    MathJax.typesetPromise([expContainer]).catch((err) => console.log(err.message));
                }
                
                document.getElementById('btn-next').classList.add('hidden');
                document.getElementById('btn-retry').classList.add('hidden');
                document.getElementById('btn-explain').classList.add('hidden');
                
                const btnCloseExplain = document.getElementById('btn-close-explain');
                btnCloseExplain.classList.remove('hidden');
                
                // Сброс стилей кнопки
                btnCloseExplain.style.display = '';
                btnCloseExplain.style.opacity = '';
                btnCloseExplain.style.transition = '';
                btnCloseExplain.style.transform = '';
                btnCloseExplain.style.animation = '';
                
                // Анимация вылета кнопки "Понятно"
                btnCloseExplain.classList.remove('btn-animated');
                void btnCloseExplain.offsetWidth; // trigger reflow
                btnCloseExplain.classList.add('btn-animated');
                btnCloseExplain.style.animationDelay = `${delayCount * 0.1}s`;
                
                // Запускаем анимацию высоты до 100vh и плавно показываем новый контент
                footer.style.height = '100vh';
                footerContent.style.opacity = '1';
                
                // После завершения анимации убираем жестко заданную высоту
                setTimeout(() => {
                    footer.style.height = '';
                    footerContent.style.transition = '';
                }, 400);
            }, 150);
        }

        function closeExplanation() {
            const footer = document.getElementById('l-footer');
            const expContainer = document.getElementById('l-feedback-explanation');
            const btnCloseExplain = document.getElementById('btn-close-explain');
            const feedbackTitle = document.getElementById('l-feedback-title');
            const footerContent = footer.querySelector('.footer-content');
            
            // 1. Фиксируем высоту футера, чтобы фон не двигался во время растворения элементов
            footer.style.height = footer.offsetHeight + 'px';
            
            const fields = Array.from(expContainer.querySelectorAll('.explanation-field'));
            
            // Фиксируем текущее состояние элементов, убирая CSS-анимации
            feedbackTitle.style.animation = 'none';
            feedbackTitle.style.opacity = '1';
            feedbackTitle.style.transform = 'translateY(0)';
            
            fields.forEach((field) => {
                field.style.animation = 'none';
                field.style.opacity = '1';
                field.style.transform = 'translateY(0)';
            });
            
            btnCloseExplain.style.animation = 'none';
            btnCloseExplain.style.opacity = '1';
            btnCloseExplain.style.transform = 'translateY(0)';
            
            // Force reflow чтобы браузер применил стили без анимаций
            void footer.offsetHeight;
            
            // Задаем транзиции для плавного растворения (opacity)
            feedbackTitle.style.transition = 'opacity 0.2s ease 0s';
            feedbackTitle.style.opacity = '0';
            
            fields.forEach((field, index) => {
                field.style.transition = `opacity 0.2s ease ${(index + 1) * 0.1}s`;
                field.style.opacity = '0';
            });
            
            btnCloseExplain.style.transition = `opacity 0.2s ease ${(fields.length + 1) * 0.1}s`;
            btnCloseExplain.style.opacity = '0';
            
            const fadeOutTime = (fields.length + 1) * 100 + 200; // задержка последнего + длительность транзиции
            
            setTimeout(() => {
                // 2. Элементы растворились на своем месте. Скрываем их полностью.
                expContainer.style.display = 'none';
                btnCloseExplain.style.display = 'none';
                
                // Убираем explanation-mode, чтобы узнать целевую высоту нормального футера
                footer.classList.remove('explanation-mode');
                
                // Показываем нормальные кнопки скрытно (opacity 0), чтобы измерить высоту
                const isSuccess = footer.classList.contains('state-success');
                const isError = footer.classList.contains('state-error');
                
                if (isSuccess) {
                    document.getElementById('btn-next').classList.remove('hidden');
                    feedbackTitle.innerHTML = '<span>✔</span> Отлично!';
                } else if (isError) {
                    document.getElementById('btn-retry').classList.remove('hidden');
                    feedbackTitle.innerHTML = '<span>✖</span> Неверно!';
                }
                document.getElementById('btn-explain').classList.remove('hidden');
                
                footerContent.style.opacity = '0'; // Прячем контент на время движения фона
                
                // Убираем жестко заданную высоту, чтобы измерить естественную высоту контента
                const currentHeight = footer.style.height;
                footer.style.height = '';
                
                // Измеряем целевую высоту
                const targetHeight = footer.offsetHeight;
                
                // Возвращаем высоту для начала анимации
                footer.style.height = currentHeight;
                
                // Возвращаем класс закрытия для анимации
                footer.classList.add('explanation-closing');
                
                // Force reflow
                void footer.offsetHeight;
                
                // 3. Запускаем движение фона вниз
                footer.style.transition = 'height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.1s ease';
                footer.style.height = targetHeight + 'px';
                
                setTimeout(() => {
                    // 4. Фон опустился. Очистка после анимации и показ нормального контента
                    footer.classList.remove('explanation-closing');
                    footer.style.height = '';
                    footer.style.transition = ''; // Возвращаем стандартный transition из CSS
                    
                    // Сбрасываем стили элементов объяснения
                    expContainer.innerHTML = '';
                    expContainer.style.display = '';
                    btnCloseExplain.style.display = '';
                    btnCloseExplain.classList.add('hidden');
                    
                    feedbackTitle.style.transition = '';
                    feedbackTitle.style.opacity = '';
                    
                    btnCloseExplain.style.transition = '';
                    btnCloseExplain.style.opacity = '';
                    btnCloseExplain.style.animation = '';
                    btnCloseExplain.style.transform = '';
                    
                    // Плавно показываем нормальный контент
                    void footerContent.offsetHeight; // reflow
                    footerContent.style.transition = 'opacity 0.2s ease';
                    footerContent.style.opacity = '1';
                    
                    setTimeout(() => {
                        footerContent.style.transition = '';
                    }, 200);
                    
                }, 400); // время движения фона
                
            }, fadeOutTime);
        }

        // Сброс красной ошибки при вводе
        document.getElementById('l-answer').addEventListener('input', () => {
            const footer = document.getElementById('l-footer');
            if (footer.className.includes('state-error')) {
                resetErrorState();
            }
        });

        // Логика кастомной математической клавиатуры
        let activeInputId = null;

        function toggleMathKeyboard(inputId, event) {
            if (event) event.preventDefault();
            
            const mf = document.getElementById(inputId);
            
            // Гарантируем, что родная клавиатура не появится
            if (mf && mf.shadowRoot) {
                const ta = mf.shadowRoot.querySelector('textarea');
                if (ta) {
                    ta.setAttribute('inputmode', 'none');
                }
            }

            const kb = document.getElementById('math-keyboard');
            if (activeInputId === inputId && kb.classList.contains('visible')) {
                // Если кликнули по тому же полю, просто оставляем клавиатуру открытой
            } else {
                activeInputId = inputId;
                kb.classList.add('visible');
                document.body.classList.add('keyboard-open');
                
                if (currentAppState !== 'math_keyboard') {
                    history.pushState({ page: 'math_keyboard' }, '');
                    currentAppState = 'math_keyboard';
                }
                
                const csWrapper = document.getElementById('cheat-sheet-wrapper');
                if (csWrapper) csWrapper.style.bottom = '380px'; // Поднимаем над клавиатурой
                
                // Поднимаем контент (чтобы можно было прокрутить до поля ввода), но футер оставляем внизу
                const content = document.getElementById('l-main');
                const kbHeight = kb.offsetHeight || 320; // Высота новой большой клавиатуры
                content.style.paddingBottom = `${kbHeight + 20}px`;
                
                // Перемещаем футер в main, чтобы он скроллился вместе с контентом
                const footer = document.getElementById('l-footer');
                content.appendChild(footer);
                footer.style.position = 'relative';
                footer.style.bottom = 'auto';
                footer.style.zIndex = '10';
                footer.style.width = 'auto';
                footer.style.marginLeft = '-20px';
                footer.style.marginRight = '-20px';
                footer.style.flexShrink = '0';
                
                setTimeout(() => {
                    const mfRect = mf.getBoundingClientRect();
                    const contentRect = content.getBoundingClientRect();
                    
                    // Вычисляем видимую область контента над клавиатурой
                    const visibleTop = contentRect.top;
                    const visibleBottom = window.innerHeight - kbHeight;
                    const visibleCenter = visibleTop + (visibleBottom - visibleTop) / 2;
                    
                    // Текущий центр поля ввода
                    const mfCenter = mfRect.top + mfRect.height / 2;
                    
                    // На сколько нужно проскроллить
                    const scrollAmount = mfCenter - visibleCenter;
                    
                    content.scrollBy({
                        top: scrollAmount,
                        behavior: 'smooth'
                    });
                }, 100);
            }
        }

        function closeMathKeyboard() {
            if (!activeInputId) return; // Если уже закрыта, ничего не делаем
            
            closeMathKeyboardVisuals();
            if (currentAppState === 'math_keyboard') {
                history.back();
            }
        }

        function closeMathKeyboardVisuals() {
            if (!activeInputId) return;
            
            const kb = document.getElementById('math-keyboard');
            kb.classList.remove('visible');
            
            const activeEl = document.activeElement;
            const isNativeInputFocused = activeEl && activeEl.tagName === 'INPUT' && (activeEl.type === 'text' || activeEl.type === 'number');
            if (!isNativeInputFocused) {
                document.body.classList.remove('keyboard-open');
            }
            
            const csWrapper = document.getElementById('cheat-sheet-wrapper');
            if (csWrapper) csWrapper.style.bottom = '100px'; // Возвращаем на место
            activeInputId = null;
            
            const content = document.getElementById('l-main');
            content.style.paddingBottom = '150px';
            
            // Возвращаем футер на место
            const footer = document.getElementById('l-footer');
            document.getElementById('lesson-view').appendChild(footer);
            footer.style.position = '';
            footer.style.bottom = '';
            footer.style.zIndex = '';
            footer.style.width = '';
            footer.style.marginLeft = '';
            footer.style.marginRight = '';
            footer.style.flexShrink = '';
        }

        function insertMath(text, cursorOffset = 0) {
            if (!activeInputId) return;
            const mf = document.getElementById(activeInputId);
            
            if (text === 'Backspace') mf.executeCommand(['deleteBackward']);
            else if (text === 'Left') mf.executeCommand(['moveToPreviousChar']);
            else if (text === 'Right') mf.executeCommand(['moveToNextChar']);
            else if (text === '/') mf.executeCommand(['insert', '\\frac{#0}{#?}']);
            else if (text === '*') mf.executeCommand(['insert', '\\cdot']);
            else if (text === '^') mf.executeCommand(['insert', '^{#?}']);
            else if (text === '_') mf.executeCommand(['insert', '_{#?}']);
            else if (text === '√') mf.executeCommand(['insert', '\\sqrt{#?}']);
            else if (text === 'Enter') {
                const oldVal = mf.value;
                
                // Считаем количество \\ внутри всех cases ДО вставки
                const countSlashesInCases = (val) => {
                    let count = 0;
                    const matches = val.match(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g);
                    if (matches) {
                        for (const match of matches) {
                            const slashes = match.match(/\\\\/g);
                            if (slashes) count += slashes.length;
                        }
                    }
                    return count;
                };
                
                const oldSlashesCount = countSlashesInCases(oldVal);
                
                mf.executeCommand(['insert', '\\\\']);
                
                const newSlashesCount = countSlashesInCases(mf.value);
                
                // Если количество \\ внутри cases увеличилось, значит мы добавили строку в cases
                // В 9 классе cases всегда на 2 строки (1 слеш). Мы не даем добавлять новые строки.
                if (newSlashesCount > oldSlashesCount) {
                    mf.value = oldVal;
                    
                    const getCursorPos = () => {
                        try { return mf.selection ? JSON.stringify(mf.selection) : mf.position; } 
                        catch(e) { return null; }
                    };
                    
                    const oldPos = getCursorPos();
                    mf.executeCommand(['moveDown']);
                    const newPos = getCursorPos();
                    
                    if (oldPos !== null && oldPos === newPos) {
                        mf.executeCommand(['moveToNextChar']);
                        mf.executeCommand(['insert', '\\\\']);
                    }
                }
            }
            else if (text === '()') mf.executeCommand(['insert', '\\left(#?\\right)']);
            else if (text === '{}') mf.executeCommand(['insert', '\\left\\{#?\\right\\}']);
            else if (text === '[]') mf.executeCommand(['insert', '\\left[#?\\right]']);
            else if (text === '[') mf.executeCommand(['insert', '[']);
            else if (text === ']') mf.executeCommand(['insert', ']']);
            else if (text === '÷') mf.executeCommand(['insert', '\\div']);
            else if (text === '|x|') mf.executeCommand(['insert', '\\left|#?\\right|']);
            else if (text === '|') mf.executeCommand(['insert', '\\mid']);
            else if (text === 'cases') mf.executeCommand(['insert', '\\begin{cases} #? \\\\ #? \\end{cases}']);
            else if (text === '≠') mf.executeCommand(['insert', '\\neq']);
            else if (text === '≈') mf.executeCommand(['insert', '\\approx']);
            else if (text === '±') mf.executeCommand(['insert', '\\pm']);
            else if (text === '∞') mf.executeCommand(['insert', '\\infty']);
            else if (text === '∈') mf.executeCommand(['insert', '\\in']);
            else if (text === '∪') mf.executeCommand(['insert', '\\cup']);
            else if (text === 'f(x)') mf.executeCommand(['insert', 'f(x)']);
            else if (text === 'D(f)') mf.executeCommand(['insert', 'D(f)']);
            else if (text === 'E(f)') mf.executeCommand(['insert', 'E(f)']);
            else if (text === ';') mf.executeCommand(['insert', ';']);
            else if (text === ',') mf.executeCommand(['insert', ',']);
            else mf.executeCommand(['insert', text]);
            
            mf.dispatchEvent(new Event('input'));
        }

        // Инициализация MathLive и блокировка родной клавиатуры
        customElements.whenDefined('math-field').then(() => {
            document.querySelectorAll('math-field').forEach(mf => {
                mf.menuItems = [];
                
                // Функция для жесткого отключения родной клавиатуры
                const disableNativeKeyboard = () => {
                    if (mf.shadowRoot) {
                        const ta = mf.shadowRoot.querySelector('textarea');
                        if (ta) {
                            ta.setAttribute('inputmode', 'none');
                        }
                    }
                };

                // Открываем нашу клавиатуру при клике (чтобы не открывалась при скролле)
                mf.addEventListener('click', () => {
                    disableNativeKeyboard();
                    toggleMathKeyboard(mf.id);
                });

                mf.addEventListener('touchstart', disableNativeKeyboard, { passive: true });
            });
        });

        // Закрытие клавиатуры при клике вне её области
        const closeKeyboardOnOutsideClick = (e) => {
            const kb = document.getElementById('math-keyboard');
            if (kb && kb.classList.contains('visible')) {
                // Проверяем, что клик был не по клавиатуре и не по полю ввода
                if (!e.target.closest('#math-keyboard') && !e.target.closest('math-field')) {
                    closeMathKeyboard();
                }
            }
        };
        // Используем click вместо mousedown/touchstart, чтобы клавиатура не закрывалась при скролле (свайпе)
        document.addEventListener('click', closeKeyboardOnOutsideClick);

        // Логика зажатия для попапов
        window.isLongPress = false;
        let pressTimer = null;
        let activePopup = null;

        const removePopup = () => {
            if (activePopup) {
                activePopup.remove();
                activePopup = null;
            }
        };

        // Закрытие попапа при клике вне его
        document.addEventListener('click', (e) => {
            if (activePopup && !e.target.closest('.math-key-popup')) {
                removePopup();
            }
        }, { capture: true });

        const handleEnd = () => {
            clearTimeout(pressTimer);
            // Мы больше не вставляем символ при отпускании, если это не клик по кнопке попапа
        };

        document.addEventListener('touchend', handleEnd);
        document.addEventListener('mouseup', handleEnd);

        document.querySelectorAll('.math-key').forEach(key => {
            const startPress = (e) => {
                // Игнорируем, если клик был по уже открытому попапу
                if (e.target.closest('.math-key-popup')) return;

                window.isLongPress = false;
                if (key.classList.contains('has-popup')) {
                    pressTimer = setTimeout(() => {
                        window.isLongPress = true;
                        const popupData = key.getAttribute('data-popup');
                        if (!popupData) return;
                        
                        const items = popupData.split(',');
                        if (items.length === 1) {
                            insertMath(items[0]);
                            key.style.background = '#d1d1d6';
                            setTimeout(() => key.style.background = '', 150);
                        } else {
                            removePopup();
                            const popup = document.createElement('div');
                            popup.className = 'math-key-popup';
                            items.forEach(item => {
                                const btn = document.createElement('div');
                                btn.className = 'math-popup-btn';
                                btn.innerText = item;
                                
                                // Обработчик клика по кнопке попапа
                                const insertItem = (ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    insertMath(item);
                                    removePopup();
                                };
                                btn.addEventListener('mousedown', insertItem);
                                btn.addEventListener('touchstart', insertItem, {passive: false});
                                
                                popup.appendChild(btn);
                            });
                            key.appendChild(popup);
                            activePopup = popup;
                        }
                    }, 300);
                }
            };

            key.addEventListener('touchstart', startPress, {passive: true});
            key.addEventListener('mousedown', startPress);

            key.addEventListener('touchmove', () => {
                if (!activePopup) clearTimeout(pressTimer);
            }, {passive: true});
            
            key.addEventListener('mouseleave', () => {
                if (!activePopup) clearTimeout(pressTimer);
            });
        });

        function handleKeyClick(e, val) {
            if (window.isLongPress) {
                window.isLongPress = false;
                return;
            }
            insertMath(val);
        }

        // Отслеживание открытия клавиатуры
        document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number')) {
                document.body.classList.add('keyboard-open');
            }
        });
        document.addEventListener('focusout', (e) => {
            if (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number')) {
                setTimeout(() => {
                    const kb = document.getElementById('math-keyboard');
                    const activeEl = document.activeElement;
                    const isNativeInputFocused = activeEl && activeEl.tagName === 'INPUT' && (activeEl.type === 'text' || activeEl.type === 'number');
                    if (!isNativeInputFocused && (!kb || !kb.classList.contains('visible'))) {
                        document.body.classList.remove('keyboard-open');
                    }
                }, 50);
            }
        });
// ==================== FIREBASE: АВТОРИЗАЦИЯ ====================
onFirebaseReady(() => {
  const auth = window.firebaseAuth;

  const authOverlay = document.getElementById("auth-overlay");
  const authAccountBtn = document.getElementById("auth-account-btn");
  const authTitle = document.getElementById("auth-title");
  const authEmail = document.getElementById("auth-email");
  const authPassword = document.getElementById("auth-password");
  const authError = document.getElementById("auth-error");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const authToggle = document.getElementById("auth-toggle");
  const authCloseBtn = document.getElementById("auth-close-btn");
  const togglePasswordBtn = document.getElementById("auth-toggle-password");
const eyeIcon = document.getElementById("auth-eye-icon");

togglePasswordBtn.addEventListener("click", () => {
  const isHidden = authPassword.type === "password";
  authPassword.type = isHidden ? "text" : "password";
  eyeIcon.innerHTML = isHidden
    ? '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
});

  let isRegisterMode = false;

  // Открыть окно входа
  authAccountBtn.addEventListener("click", () => {
    if (auth.currentUser) {
      // Если уже вошёл — кнопка работает как "Выйти"
      if (confirm("Выйти из аккаунта?")) {
        import("https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js").then(({ signOut }) => {
          signOut(auth);
          localStorage.removeItem("platformLogin");
        });
      }
      return;
    }
    authError.style.display = "none";
    authEmail.value = "";
    authPassword.value = "";
    authOverlay.classList.remove("hidden");
  });

  // Клик по фону — закрыть окно
  authOverlay.addEventListener("click", (e) => {
    if (e.target === authOverlay) {
      authOverlay.classList.add("hidden");
    }
  });

    // Клик по крестику — закрыть окно
        authCloseBtn.addEventListener("click", () => {
          authOverlay.classList.add("hidden");
        });

        // Прокрутка к полю при открытии клавиатуры
        [authEmail, authPassword].forEach((input) => {
          input.addEventListener("focus", () => {
            setTimeout(() => {
              input.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
          });
        });

  // Переключение между "Вход" и "Регистрация"
  authToggle.addEventListener("click", () => {
    isRegisterMode = !isRegisterMode;
    authTitle.textContent = isRegisterMode ? "Регистрация" : "Вход";
    authSubmitBtn.querySelector(".auth-btn-text").textContent = isRegisterMode ? "Зарегистрироваться" : "Войти";
    authToggle.textContent = isRegisterMode ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться";
    authError.style.display = "none";
  });

  // Отправка формы
  authSubmitBtn.addEventListener("click", async () => {
    authSubmitBtn.classList.add("loading");
authSubmitBtn.disabled = true;
    const email = authEmail.value.trim();
    const password = authPassword.value;
    authError.style.display = "none";

    if (!email || !password) {
    authError.textContent = "Заполните все поля";
    authError.style.display = "block";
    authSubmitBtn.classList.remove("loading");
    authSubmitBtn.disabled = false;
    return;
    }

const { signInWithCustomToken } =
    await import("https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js");

async function attemptAuthRequest(action, email, password) {
    const res = await fetch("https://d5dkes6tf8o0uff54egi.4b4k4pg5.apigw.yandexcloud.net/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, login: email, password })
    });
    const data = await res.json();
    return { res, data };
}

try {
    const action = isRegisterMode ? "register" : "login";
    let result;
    try {
        result = await attemptAuthRequest(action, email, password);
    } catch (err1) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            result = await attemptAuthRequest(action, email, password);
        } catch (err2) {
            await new Promise(r => setTimeout(r, 1000));
            result = await attemptAuthRequest(action, email, password);
        }
    }

    const { res, data } = result;

    if (!res.ok) {
        authError.textContent = data.error || "Ошибка входа";
        authError.style.display = "block";
        return;
    }

    await signInWithCustomToken(auth, data.token);
    localStorage.setItem("platformLogin", email);
    authOverlay.classList.add("hidden");
} catch (err) {
    authError.textContent = "Ошибка соединения с сервером";
    authError.style.display = "block";
} finally {
    authSubmitBtn.classList.remove("loading");
    authSubmitBtn.disabled = false;
}
  });

  // Слежение за состоянием входа — обновляем текст кнопки
  import("https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js").then(({ onAuthStateChanged }) => {
    onAuthStateChanged(auth, (user) => {
if (user) {
    const savedLogin = localStorage.getItem("platformLogin");
    authAccountBtn.textContent = savedLogin ? savedLogin.split("@")[0] : "Профиль";
} else {
    authAccountBtn.textContent = "Войти";
}
    });
  });

  function translateAuthError(code) {
    const map = {
      "auth/email-already-in-use": "Этот email уже зарегистрирован",
      "auth/invalid-email": "Некорректный email",
      "auth/weak-password": "Пароль слишком короткий (минимум 6 символов)",
      "auth/invalid-credential": "Неверный email или пароль",
      "auth/too-many-requests": "Слишком много попыток, попробуйте позже"
    };
    return map[code] || "Ошибка: " + code;
  }
});
// ==================== FIREBASE: ПРОГРЕСС УЧЕНИКА ====================
let userProgress = {};

async function markLessonComplete(topicId, lessonId, failedTasks) {
  const auth = window.firebaseAuth;
  const db = window.firebaseDb;
  if (!auth.currentUser) return;

  const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js");

  try {
    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        progress: {
          [topicId]: {
            [lessonId]: {
              completed: true,
              failedTasks: failedTasks
            }
          }
        }
      },
      { merge: true }
    );
  } catch (err) {
    console.error("Ошибка сохранения прогресса:", err);
  }
}

async function loadUserProgress() {
  const auth = window.firebaseAuth;
  const db = window.firebaseDb;
  if (!auth.currentUser) {
    userProgress = {};
    return;
  }

  const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js");

  try {
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    userProgress = snap.exists() ? (snap.data().progress || {}) : {};
  } catch (err) {
    console.error("Ошибка загрузки прогресса:", err);
    userProgress = {};
  }
}

onFirebaseReady(() => {
  const auth = window.firebaseAuth;
  import("https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js").then(({ onAuthStateChanged }) => {
    onAuthStateChanged(auth, async () => {
      await loadUserProgress();
    });
  });
});

function renderLevelCircleCheckmark(btn, animate) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "level-check-svg" + (animate ? "" : " visible"));
    svg.setAttribute("viewBox", "0 0 100 100");

    const btnRadius = 50;
    const strokeWidth = 7;
    const ringRadius = btnRadius - strokeWidth - (strokeWidth / 2);

    const ring = document.createElementNS(svgNS, "circle");
    ring.setAttribute("class", "level-check-ring");
    ring.setAttribute("cx", "50");
    ring.setAttribute("cy", "50");
    ring.setAttribute("r", ringRadius);
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "white");
    ring.setAttribute("stroke-width", strokeWidth);
    ring.setAttribute("stroke-linecap", "round");
    ring.style.transformOrigin = "50px 50px";
    ring.style.transform = "rotate(-90deg)";

    const check = document.createElementNS(svgNS, "path");
    check.setAttribute("class", "level-check-mark");
    check.setAttribute("d", "M33 51 L45 63 L69 37");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke", "white");
    check.setAttribute("stroke-width", "8");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");

    svg.appendChild(ring);
    svg.appendChild(check);
    btn.appendChild(svg);

    const ringLength = 2 * Math.PI * ringRadius;
    const checkLength = check.getTotalLength();

    ring.style.strokeDasharray = ringLength;
    check.style.strokeDasharray = checkLength;

    if (animate) {
        ring.style.transition = 'none';
        check.style.transition = 'none';
        ring.style.strokeDashoffset = ringLength;
        check.style.strokeDashoffset = checkLength;
        svg.classList.add('visible');

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                ring.style.transition = 'stroke-dashoffset 1.0s ease';
                ring.style.strokeDashoffset = 0;

                setTimeout(() => {
                    check.style.transition = 'stroke-dashoffset 0.7s ease';
                    check.style.strokeDashoffset = 0;
                }, 350);
            });
        });
    } else {
        ring.style.strokeDashoffset = 0;
        check.style.strokeDashoffset = 0;
    }
}

function animateJustCompletedLesson() {
    if (!justCompletedLessonId) return;
    const btn = document.querySelector(`#path-container .level-circle[data-lesson-id="${justCompletedLessonId}"]`);
    if (btn) {
        const numberSpan = btn.querySelector('.level-number-text');
        renderLevelCircleCheckmark(btn, true);
        if (numberSpan) numberSpan.classList.add('hidden-anim');
    }
    justCompletedLessonId = null;
}

// --- ЛОГИКА СТРАНИЦЫ АККАУНТА ---

function initAccountLogic() {
    const dotsBtn = document.getElementById('email-dots-btn');
    const actionsPanel = document.getElementById('email-actions-panel');
    const overallWrapper = document.getElementById('overall-progress-wrapper');
    const btnLogout = document.getElementById('btn-logout');
    const btnDelete = document.getElementById('btn-delete');

    // Троеточие
    dotsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = actionsPanel.classList.toggle('open');
        dotsBtn.classList.toggle('active', isExpanded);
        overallWrapper.classList.toggle('collapsed', isExpanded);
    });

    // Закрытие панели при клике вне её
    document.addEventListener('click', () => {
        actionsPanel?.classList.remove('open');
        dotsBtn?.classList.remove('active');
        overallWrapper?.classList.remove('collapsed');
    });

    // Кнопка выхода из аккаунта
    btnLogout?.addEventListener('click', (e) => {
        e.stopPropagation();
        showAccountModal('logout');
    });

    // Кнопка удаления аккаунта
btnDelete?.addEventListener('click', (e) => {
    e.stopPropagation();
    showAccountModal('delete');
});

    // Изменение состояния авторизации
    onFirebaseReady(() => {
        const auth = window.firebaseAuth;
        import("https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js").then(({ onAuthStateChanged }) => {
            onAuthStateChanged(auth, (user) => {
                updateAccountUI(user);
            });
        });
    });
}

function updateAccountUI(user = null) {
    const emailDisplay = document.getElementById('user-email-display');
    const currentUser = user || (window.firebaseAuth ? window.firebaseAuth.currentUser : null);

    if (currentUser) {
        const savedLogin = localStorage.getItem("platformLogin");
        if (emailDisplay) emailDisplay.textContent = savedLogin || 'Аккаунт';
    } else {
        if (emailDisplay) emailDisplay.textContent = 'Гость';
    }
    updateProgressStats();
}

function showAccountModal(action) {
    const modal = document.getElementById('confirm-modal');
    const modalIcon = document.getElementById('modal-icon-container');
    const modalTitle = document.getElementById('modal-title');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');

    if (action === 'logout') {
        modalIcon.className = 'modal-icon-container purple';
        modalIcon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`;
        modalTitle.textContent = 'Выйти из аккаунта?';
        modalConfirmBtn.className = 'modal-btn-confirm purple';
        modalConfirmBtn.textContent = 'Да, выйти';
        modalConfirmBtn.onclick = () => {
            if (window.firebaseAuth) {
                import("https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js").then(({ signOut }) => {
                    signOut(window.firebaseAuth).then(() => {
                        modal.classList.add('hidden');
                        showToast('Вы успешно вышли из аккаунта');
                        navigateToMenuTab('topics');
                    });
                });
            }
        };
    } else if (action === 'delete') {
        modalIcon.className = 'modal-icon-container red';
        modalIcon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
        modalTitle.textContent = 'Удалить аккаунт без возможности восстановления?';
        modalConfirmBtn.className = 'modal-btn-confirm red';
        modalConfirmBtn.textContent = 'Да, удалить';
        modalConfirmBtn.onclick = async () => {
            if (!window.firebaseAuth || !window.firebaseAuth.currentUser) return;
            modalConfirmBtn.disabled = true;
            modalConfirmBtn.textContent = 'Удаление...';
            try {
                const idToken = await window.firebaseAuth.currentUser.getIdToken();
                const res = await fetch("https://d5dkes6tf8o0uff54egi.4b4k4pg5.apigw.yandexcloud.net/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "delete", idToken: idToken })
                });
                const data = await res.json();
                if (!res.ok) {
                    showToast(data.error || 'Не удалось удалить аккаунт');
                    modalConfirmBtn.disabled = false;
                    modalConfirmBtn.textContent = 'Да, удалить';
                    return;
                }
                localStorage.removeItem("platformLogin");
                modal.classList.add('hidden');
                showToast('Аккаунт удалён');
                navigateToMenuTab('topics');
            } catch (err) {
                showToast('Ошибка соединения с сервером');
                modalConfirmBtn.disabled = false;
                modalConfirmBtn.textContent = 'Да, удалить';
            }
        };
    }
    modal.classList.remove('hidden');
}

function renderProgressTable() {
    const container = document.getElementById('progress-table-container');
    if (!container) return;

    if (!COURSE_DATA || !COURSE_DATA.topics) {
        container.innerHTML = '<div style="text-align:center; padding: 20px; color: #9ca3af;">Темы не загружены</div>';
        return;
    }

    container.innerHTML = COURSE_DATA.topics.map(t => {
        // Вычисляем процент прохождения темы на основе userProgress
        let totalLessons = 0;
        let completedLessons = 0;

        t.subtopics.forEach(sub => {
            sub.levels.forEach(level => {
                const lessonId = typeof level === 'object' ? level.lessonId : level;
                const lesson = COURSE_DATA.lessons[lessonId];
                const isRegularLesson = !(lesson && (lesson.isTest || lesson.isRepetition || lesson.isGenerator));
                
                if (isRegularLesson) {
                    totalLessons++;
                    if (t.baseId && userProgress[t.baseId] && userProgress[t.baseId][lessonId] && userProgress[t.baseId][lessonId].completed) {
                        completedLessons++;
                    }
                }
            });
        });

        const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
        const isComplete = progress === 100 && totalLessons > 0;
        const meta = getRepetitionTopicMeta(t);

        return `
            <div class="table-row">
                <div class="row-top">
                    <div class="row-left">
                        <div class="row-icon-box ${isComplete ? 'complete' : 'incomplete'}">
                            ${getRepetitionIconSvg(meta.icon)}
                        </div>
                        <div class="row-titles">
                            <div class="title">${t.title}</div>
                            <div class="subtitle">${meta.subtitle}</div>
                        </div>
                    </div>
                    <div class="row-right">
                        <span class="progress-text ${isComplete ? 'complete' : 'incomplete'}">${progress}%</span>
                        ${isComplete ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="#eefce8" stroke="#58CC00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>` : ''}
                    </div>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill ${isComplete ? 'complete' : 'incomplete'}" style="width: ${progress}%">
                        <div class="specular-highlight"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const totalTasksElem = document.getElementById('total-tasks-count');
    if (totalTasksElem) {
        let totalRegularLessons = 0;
        COURSE_DATA.topics.forEach(t => {
            t.subtopics.forEach(sub => {
                sub.levels.forEach(level => {
                    const lessonId = typeof level === 'object' ? level.lessonId : level;
                    const lesson = COURSE_DATA.lessons[lessonId];
                    if (!(lesson && (lesson.isTest || lesson.isRepetition || lesson.isGenerator))) {
                        totalRegularLessons++;
                    }
                });
            });
        });
        totalTasksElem.textContent = `${totalRegularLessons} заданий`;
    }
}

function updateProgressStats() {
    if (!COURSE_DATA || !COURSE_DATA.topics) return;

    let totalLessons = 0;
    let completedLessons = 0;
    let masteredCount = 0;

    COURSE_DATA.topics.forEach(t => {
        let topicTotal = 0;
        let topicCompleted = 0;

        t.subtopics.forEach(sub => {
            sub.levels.forEach(level => {
                const lessonId = typeof level === 'object' ? level.lessonId : level;
                const lesson = COURSE_DATA.lessons[lessonId];
                const isRegularLesson = !(lesson && (lesson.isTest || lesson.isRepetition || lesson.isGenerator));
                
                if (isRegularLesson) {
                    totalLessons++;
                    topicTotal++;
                    if (t.baseId && userProgress[t.baseId] && userProgress[t.baseId][lessonId] && userProgress[t.baseId][lessonId].completed) {
                        completedLessons++;
                        topicCompleted++;
                    }
                }
            });
        });

        if (topicTotal > 0 && topicCompleted === topicTotal) {
            masteredCount++;
        }
    });

    const totalAvg = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    const percentageElem = document.getElementById('overall-percentage');
    const badgeTextElem = document.getElementById('mastered-badge-text');

    if (percentageElem) percentageElem.textContent = `${totalAvg}%`;
    if (badgeTextElem) badgeTextElem.textContent = `${masteredCount} из ${COURSE_DATA.topics.length} освоено`;
}

function showToast(text) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = text;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 2500);
}
