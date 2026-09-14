/* ===================================================
   task-generator.js

   Переделывает задания типа "input" в "options" или "details",
   зная только правильный ответ (task.correctAnswer).
   Ничего не знает про смысл ответа (интервал, дробь, пара чисел и т.п.) —
   просто находит в строке числа и текстовые куски вокруг них,
   и умеет их правдоподобно "портить" для дистракторов.

   Подключается отдельным <script> после script.js.
   Точка входа: autoGenerateLesson(tasks) — см. в самом низу файла.
   =================================================== */


/* ===================================================
   СЛОЙ 2 — разбор ответа на токены (числа + текст между ними)
   =================================================== */

// Разбивает строку ответа на чередующиеся куски: текст, число, текст, число...
// Число — это { type:'number', value:'14', num:14 }, текст — { type:'text', value:' и ' }.
// Пустые текстовые куски (например, если ответ начинается сразу с числа) не отбрасываются
// здесь намеренно — фильтрация происходит там, где куски раскладываются по деталям/тексту.
function tokenizeAnswer(answer) {
    const str = String(answer);
    const re = /-?\d+(?:([.,])(\d+))?/g;
    const tokens = [];
    let lastIndex = 0;
    let match;

    while ((match = re.exec(str)) !== null) {
        if (match.index > lastIndex) {
            tokens.push({ type: 'text', value: str.slice(lastIndex, match.index) });
        }
        const separator = match[1] || null;               // "." или "," — или null для целого числа
        const decimals = match[2] ? match[2].length : 0;   // сколько цифр после разделителя
        tokens.push({
            type: 'number',
            value: match[0],
            num: parseFloat(match[0].replace(',', '.')),
            separator,
            decimals
        });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
        tokens.push({ type: 'text', value: str.slice(lastIndex) });
    }
    return tokens;
}

// Собирает токены обратно в строку (используется после мутации чисел)
function tokensToString(tokens) {
    return tokens.map(t => t.value).join('');
}

// Список чисел, встретившихся в ответе, по порядку
function extractNumbers(tokens) {
    return tokens.filter(t => t.type === 'number').map(t => t.num);
}

// Если все числа ответа образуют арифметическую последовательность (одна и та же
// разница между соседними) — возвращает эту разницу (шаг), иначе null.
// Для одного числа или его отсутствия шаг не определён — тоже null.
function getArithmeticStep(tokens) {
    const nums = extractNumbers(tokens);
    if (nums.length < 2) return null;
    const step = nums[1] - nums[0];
    for (let i = 2; i < nums.length; i++) {
        if (nums[i] - nums[i - 1] !== step) return null;
    }
    return step;
}


/* ===================================================
   СЛОЙ 3 — приёмы мутации чисел
   Каждый приём принимает клон массива токенов и возвращает новый клон
   с изменёнными значениями (value и num) у нужных числовых токенов.
   =================================================== */

function cloneTokens(tokens) {
    return tokens.map(t => ({ ...t }));
}

// Форматирует число под конкретный токен: если у исходного числа была дробная часть,
// сохраняем то же количество знаков и тот же разделитель (0,56 -> 0,59, а не 0.59
// и не 0,5900000000000001 из-за погрешности плавающей точки)
function formatNumber(num, token) {
    if (token && token.decimals > 0) {
        const fixed = num.toFixed(token.decimals);
        return token.separator === ',' ? fixed.replace('.', ',') : fixed;
    }
    return String(num);
}

function setTokenNumber(token, num) {
    if (token.decimals > 0) {
        num = Number(num.toFixed(token.decimals)); // округляем до исходной точности
    }
    token.num = num;
    token.value = formatNumber(num, token);
}

// Приём 1: синхронный сдвиг — ВСЕ числа в ответе сдвигаются на одну и ту же дельту.
// Используется только когда между числами есть фиксированная арифметическая разница
// (иначе сдвиг развалит связь между числами и получится не "похожий", а случайный ответ).
function mutateShiftAll(tokens, decimalMode) {
    const clone = cloneTokens(tokens);
    const firstNumber = clone.find(t => t.type === 'number');
    const delta = randomDeltaForToken(firstNumber, decimalMode);
    clone.forEach(t => { if (t.type === 'number') setTokenNumber(t, t.num + delta); });
    return clone;
}

// Приём 2: независимый сдвиг — трогаем только одно случайно выбранное число.
function mutateShiftOne(tokens, numberIndices, decimalMode) {
    const clone = cloneTokens(tokens);
    const idx = numberIndices[Math.floor(Math.random() * numberIndices.length)];
    const delta = randomDeltaForToken(clone[idx], decimalMode);
    setTokenNumber(clone[idx], clone[idx].num + delta);
    return clone;
}

// Приём 3: смена знака у одного случайного числа (5 -> -5). Бессмысленна для 0.
function mutateNegate(tokens, numberIndices) {
    const candidates = numberIndices.filter(i => tokens[i].num !== 0);
    if (candidates.length === 0) return null;
    const clone = cloneTokens(tokens);
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    setTokenNumber(clone[idx], -clone[idx].num);
    return clone;
}

// Дельта для сдвига: обычно небольшое целое число (1-3). Но если весь урок состоит
// из десятичных дробей (decimalMode) — сдвигаем на уровне последнего разряда самой
// дроби (0,2 -> 0,3 / 0,1, а не 0,2 -> 1,2), чтобы дистрактор остался похожей дробью.
function randomDeltaForToken(token, decimalMode) {
    const magnitude = 1 + Math.floor(Math.random() * 3);
    const sign = Math.random() < 0.5 ? 1 : -1;
    if (decimalMode && token && token.decimals > 0) {
        return sign * magnitude * Math.pow(10, -token.decimals);
    }
    return sign * magnitude;
}


/* ===================================================
   Генерация дистракторов для типа "options"
   =================================================== */

// Возвращает массив строк-дистракторов (без учёта верного ответа), длиной до `count`.
// Пытается использовать разные приёмы, чтобы дистракторы отличались друг от друга по "характеру".
function generateDistractorStrings(tokens, correctString, count, decimalMode) {
    const numberIndices = tokens.map((t, i) => t.type === 'number' ? i : -1).filter(i => i !== -1);
    if (numberIndices.length === 0) return []; // нет чисел — мутировать нечего, options не построить

    const syncStep = getArithmeticStep(tokens);
    const results = new Set();
    const maxAttempts = count * 15;
    let attempts = 0;

    // Если числа связаны фиксированной разницей ("14 и 15") — трогать их
    // по отдельности нельзя, иначе связь развалится и получится не дистрактор,
    // а бессмыслица вроде "14 и -15". В этом случае годится только синхронный сдвиг.
    const techniques = (syncStep !== null)
        ? ['syncShift']
        : ['independentShift', 'negate'];

    let techPointer = 0;
    while (results.size < count && attempts < maxAttempts) {
        attempts++;
        const technique = techniques[techPointer % techniques.length];
        techPointer++;

        let mutated = null;
        if (technique === 'syncShift') {
            mutated = mutateShiftAll(tokens, decimalMode);
        } else if (technique === 'independentShift') {
            mutated = mutateShiftOne(tokens, numberIndices, decimalMode);
        } else if (technique === 'negate') {
            mutated = mutateNegate(tokens, numberIndices);
        }
        if (!mutated) continue;

        const str = tokensToString(mutated);
        if (str === correctString) continue;
        results.add(str);
    }
    return Array.from(results);
}

// Собирает готовое задание типа "options" на основе исходного task.correctAnswer.
// Ничего не пишет напрямую в исходный task — возвращает новый объект полей для слияния,
// либо null, если из этого ответа options сделать не получилось (нет чисел).
function buildOptionsFields(correctAnswer, optionsCount, decimalMode) {
    optionsCount = optionsCount || 4;
    const tokens = tokenizeAnswer(correctAnswer);
    const correctString = tokensToString(tokens);
    const distractors = generateDistractorStrings(tokens, correctString, optionsCount - 1, decimalMode);
    if (distractors.length === 0) return null;

    const variants = [correctString, ...distractors];
    // Перемешиваем, запоминая, куда встал верный ответ
    for (let i = variants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [variants[i], variants[j]] = [variants[j], variants[i]];
    }
    const correctIndex = variants.indexOf(correctString) + 1; // нумерация с 1

    const fields = { type: 'options', correctAnswer: String(correctIndex) };
    variants.forEach((text, i) => { fields[`${i + 1} option`] = text; });
    return fields;
}


/* ===================================================
   Генерация раскладки для типа "details"
   =================================================== */

// Может ли ответ вообще быть "собран из деталей": нужно минимум 2 осмысленных куска
// (иначе, как с голым "5", разбирать нечего — это ровно один кусок).
function canBeDetails(correctAnswer) {
    const tokens = tokenizeAnswer(correctAnswer).filter(t => t.value.trim() !== '' || t.type === 'number');
    return tokens.length > 1;
}

// Для details лимит — 9 деталей суммарно (одна цифра на индекс в correctAnswer,
// см. как платформа хранит порядок: detailsSequence.join('') === task.correctAnswer)
const MAX_DETAILS = 9;

function buildDetailsFields(correctAnswer, decimalMode) {
    const rawTokens = tokenizeAnswer(correctAnswer);
    // осмысленные куски: непустой текст или любое число
    const tokens = rawTokens.filter(t => t.type === 'number' || t.value !== '');
    if (tokens.length <= 1) return null;

    const numberIndices = tokens.map((t, i) => t.type === 'number' ? i : -1).filter(i => i !== -1);

    // Правильные кусочки — все токены по порядку
    const pieces = tokens.map((t, originalOrder) => ({ text: t.value, isCorrect: true, originalOrder }));

    // На каждое число пытаемся добавить один кусок-приманку (пока не упёрлись в лимит)
    const usedDecoyValues = new Set();
    for (const idx of numberIndices) {
        if (pieces.length >= MAX_DETAILS) break;
        const token = tokens[idx];
        const technique = Math.random() < 0.5 ? 'negate' : 'shift';
        let decoyNum = null;
        if (technique === 'negate' && token.num !== 0) {
            decoyNum = -token.num;
        }
        if (decoyNum === null) {
            decoyNum = token.num + randomDeltaForToken(token, decimalMode);
        }
        const decoyText = formatNumber(decoyNum, token);
        if (decoyText === token.value || usedDecoyValues.has(decoyText)) continue;
        usedDecoyValues.add(decoyText);
        pieces.push({ text: decoyText, isCorrect: false });
    }

    // Перемешиваем весь банк деталей
    for (let i = pieces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }

    const fields = { type: 'details' };
    // Индекс (1..N) каждого кусочка после перемешивания
    pieces.forEach((p, i) => { p.assignedIndex = i + 1; fields[`${i + 1} detail`] = p.text; });

    // correctAnswer — индексы верных кусочков в исходном порядке слева направо
    const correctAnswerDigits = pieces
        .filter(p => p.isCorrect)
        .sort((a, b) => a.originalOrder - b.originalOrder)
        .map(p => p.assignedIndex)
        .join('');
    fields.correctAnswer = correctAnswerDigits;

    return fields;
}


/* ===================================================
   СЛОЙ 1 — планирование типов заданий по всему уроку
   =================================================== */

// Для одного задания определяет, какие типы ему в принципе доступны
function getAvailableTypes(correctAnswer) {
    const tokens = tokenizeAnswer(correctAnswer);
    const hasNumbers = tokens.some(t => t.type === 'number');
    const types = ['input'];
    if (hasNumbers) types.push('options');
    if (canBeDetails(correctAnswer)) types.push('details');
    return types;
}

function isInputTask(task) {
    return !!task && typeof task.type === 'string' && task.type.trim().toLowerCase() === 'input';
}

// Проверяет, являются ли ВСЕ числа во ВСЕХ input-заданиях урока десятичными дробями
// (через точку или через запятую — принимаются оба варианта одинаково). Если да —
// во всём уроке дистракторы будут генерироваться как похожие дроби той же точности,
// а не сдвигом на целые числа.
function isLessonAllDecimal(inputTasks) {
    let sawAnyNumber = false;
    for (const task of inputTasks) {
        const numberTokens = tokenizeAnswer(task.correctAnswer).filter(t => t.type === 'number');
        if (numberTokens.length === 0) continue; // в этом ответе чисел нет — не мешает решению
        sawAnyNumber = true;
        if (numberTokens.some(t => t.decimals === 0)) return false; // нашли целое число — урок не "дробный"
    }
    return sawAnyNumber;
}

// Распределяет типы по всем input-заданиям урока, стараясь выровнять количество
// input/options/details примерно поровну, с учётом того, что не любое задание
// можно превратить в любой тип.
function planLessonTypes(tasks) {
    const inputTasks = tasks.filter(isInputTask);
    const n = inputTasks.length;
    if (n === 0) return tasks;

    // если весь урок состоит из десятичных дробей — дистракторы тоже будут дробями
    const decimalMode = isLessonAllDecimal(inputTasks);

    const base = Math.floor(n / 3);
    const quotas = { input: base, options: base, details: base };
    // остаток раскидываем по input — самый безопасный вариант по умолчанию
    quotas.input += n - (base * 3);

    // считаем доступные типы для каждого задания заранее
    const meta = inputTasks.map(task => ({
        task,
        available: getAvailableTypes(task.correctAnswer)
    }));

    // сначала обрабатываем самые "зажатые" задания (у которых меньше выбора)
    meta.sort((a, b) => a.available.length - b.available.length);

    meta.forEach(({ task, available }) => {
        // выбираем среди доступных тот тип, где ещё есть квота, предпочитая
        // не-input варианты (раз уж задание способно на разнообразие)
        const preferenceOrder = ['options', 'details', 'input'].filter(t => available.includes(t));
        let chosen = preferenceOrder.find(t => quotas[t] > 0);
        if (!chosen) chosen = 'input'; // квоты кончились — оставляем как есть

        if (chosen === 'options') {
            const fields = buildOptionsFields(task.correctAnswer, 4, decimalMode);
            if (fields) { Object.assign(task, fields); quotas.options--; return; }
            chosen = 'details'; // не вышло (не должно случаться, раз available это разрешал) — пробуем запасной вариант
        }
        if (chosen === 'details') {
            const fields = buildDetailsFields(task.correctAnswer, decimalMode);
            if (fields) { Object.assign(task, fields); quotas.details--; return; }
        }
        // остаётся как input — ничего не меняем, просто "тратим" квоту input, если она была
        if (quotas.input > 0) quotas.input--;
    });

    return tasks;
}


/* ===================================================
   Точка входа
   =================================================== */

// Вызывается при открытии урока: tasks — массив заданий урока (как они лежат в JSON).
// theory-задания не трогаются вообще, задания с типом, отличным от input, тоже не трогаются.
function autoGenerateLesson(tasks) {
    return planLessonTypes(tasks);
}
