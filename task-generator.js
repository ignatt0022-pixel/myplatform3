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
// Символы, у которых есть "противоположная" версия — скобки и знаки неравенства.
// Используются, чтобы делать дистракторы вида "(0,5; 0,6]" вместо честного "[0,5; 0,6]".
const SWAP_MAP = { '[': '(', '(': '[', ']': ')', ')': ']', '<': '>', '>': '<' };

// Режет текстовый кусок на отдельные токены: одиночные "переключаемые" символы
// становятся своим токеном type:'symbol', всё остальное (пробелы, ";", "и" и т.п.)
// остаётся текстом как раньше
function splitSymbolTokens(text) {
    const result = [];
    let buf = '';
    for (const ch of text) {
        if (SWAP_MAP.hasOwnProperty(ch)) {
            if (buf) { result.push({ type: 'text', value: buf }); buf = ''; }
            result.push({ type: 'symbol', value: ch });
        } else {
            buf += ch;
        }
    }
    if (buf) result.push({ type: 'text', value: buf });
    return result;
}

// Корень целиком — неделимый кусок: "\sqrt{7}", "√7", "√(7)". Число внутри мутируем
// как единое целое (весь корень меняется на другой готовый корень), а не разбираем
// на "\sqrt{" + число + "}" по отдельности — иначе в детали попадёт нечитаемый обрывок кода.
const ROOT_RE = /\\sqrt\{(-?\d+(?:[.,]\d+)?)\}|√\((-?\d+(?:[.,]\d+)?)\)|√(-?\d+(?:[.,]\d+)?)/g;

function rootFormatOf(m) {
    if (m[1] !== undefined) return 'latex'; // \sqrt{N}
    if (m[2] !== undefined) return 'paren'; // √(N)
    return 'plain';                          // √N
}

function formatRoot(num, format) {
    const n = String(num);
    if (format === 'latex') return `\\sqrt{${n}}`;
    if (format === 'paren') return `√(${n})`;
    return `√${n}`;
}

// Обычная (без корней) разбивка куска строки на числа/символы/текст —
// прежнее содержимое tokenizeAnswer
function tokenizePlain(str) {
    const re = /-?\d+(?:([.,])(\d+))?/g;
    const tokens = [];
    let lastIndex = 0;
    let match;

    while ((match = re.exec(str)) !== null) {
        if (match.index > lastIndex) {
            tokens.push(...splitSymbolTokens(str.slice(lastIndex, match.index)));
        }
        const separator = match[1] || null;               // "." или "," — или null для целого числа
        const decimals = match[2] ? match[2].length : 0;   // сколько цифр после разделителя
        // разделитель нормализуем к запятой сразу здесь, даже если в ответе была точка —
        // "видим" точку при разборе, но дальше везде (и в правильном варианте среди
        // options/details, и в дистракторах) показываем только запятую
        tokens.push({
            type: 'number',
            value: separator ? match[0].replace(separator, ',') : match[0],
            num: parseFloat(match[0].replace(',', '.')),
            separator: separator ? ',' : null,
            decimals
        });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
        tokens.push(...splitSymbolTokens(str.slice(lastIndex)));
    }
    return tokens;
}

function tokenizeAnswer(answer) {
    const str = String(answer);
    const tokens = [];
    let lastIndex = 0;
    let match;

    // сначала выделяем корни целиком, чтобы дальше их точно никто не разобрал на части
    while ((match = ROOT_RE.exec(str)) !== null) {
        if (match.index > lastIndex) {
            tokens.push(...tokenizePlain(str.slice(lastIndex, match.index)));
        }
        const numStr = match[1] || match[2] || match[3];
        tokens.push({
            type: 'root',
            value: match[0],
            num: parseFloat(numStr.replace(',', '.')),
            format: rootFormatOf(match),
            decimals: 0
        });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
        tokens.push(...tokenizePlain(str.slice(lastIndex)));
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

// Приём 4: смена одной скобки/знака на противоположный ("[" -> "(", "<" -> ">").
function mutateSwapSymbol(tokens, symbolIndices) {
    if (symbolIndices.length === 0) return null;
    const clone = cloneTokens(tokens);
    const idx = symbolIndices[Math.floor(Math.random() * symbolIndices.length)];
    clone[idx].value = SWAP_MAP[clone[idx].value];
    return clone;
}

// Приём 5: меняем число под корнем, пересобирая корень целиком той же формы
// ("\sqrt{7}" -> "\sqrt{9}"), не трогая сам синтаксис корня.
function mutateShiftRoot(tokens, rootIndices, decimalMode) {
    if (rootIndices.length === 0) return null;
    const clone = cloneTokens(tokens);
    const idx = rootIndices[Math.floor(Math.random() * rootIndices.length)];
    const token = clone[idx];
    let newNum = token.num + randomDeltaForToken(token, decimalMode);
    if (newNum < 0) newNum = Math.abs(newNum) + 1; // под корнем отрицательного числа не бывает
    token.num = newNum;
    token.value = formatRoot(newNum, token.format);
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
    const rootIndices = tokens.map((t, i) => t.type === 'root' ? i : -1).filter(i => i !== -1);
    if (numberIndices.length === 0 && rootIndices.length === 0) return []; // мутировать нечего

    const symbolIndices = tokens.map((t, i) => t.type === 'symbol' ? i : -1).filter(i => i !== -1);
    const syncStep = getArithmeticStep(tokens);
    const results = new Set();
    const maxAttempts = count * 15;
    let attempts = 0;

    // Если числа связаны фиксированной разницей ("14 и 15") — трогать их
    // по отдельности нельзя, иначе связь развалится и получится не дистрактор,
    // а бессмыслица вроде "14 и -15". В этом случае годится только синхронный сдвиг.
    const techniques = [];
    if (numberIndices.length > 0) {
        techniques.push(syncStep !== null ? 'syncShift' : 'independentShift');
    }
    // скобки/знаки неравенства можно путать независимо от того, как мы обходимся с числами
    if (symbolIndices.length > 0) techniques.push('swapSymbol');
    // число под корнем меняем целиком, пересобирая весь корень
    if (rootIndices.length > 0) techniques.push('shiftRoot');

    let techPointer = 0;
    while (results.size < count && attempts < maxAttempts) {
        attempts++;
        let technique;
        if (symbolIndices.length > 0 && Math.random() < 0.5) {
            // скобке/знаку неравенства даём отдельный шанс ~50% на попытку —
            // иначе при чередовании по кругу с другими приёмами она попадает
            // в дистракторы слишком редко
            technique = 'swapSymbol';
        } else {
            const otherTechniques = techniques.filter(t => t !== 'swapSymbol');
            technique = otherTechniques.length > 0
                ? otherTechniques[techPointer % otherTechniques.length]
                : 'swapSymbol';
            techPointer++;
        }

        let mutated = null;
        if (technique === 'syncShift') {
            mutated = mutateShiftAll(tokens, decimalMode);
        } else if (technique === 'independentShift') {
            mutated = mutateShiftOne(tokens, numberIndices, decimalMode);
        } else if (technique === 'swapSymbol') {
            mutated = mutateSwapSymbol(tokens, symbolIndices);
            // заодно меняем и число — иначе дистрактор отличался бы от правильного
            // ответа ТОЛЬКО скобкой, а числа совпадали бы один в один
            if (mutated && numberIndices.length > 0) {
                mutated = syncStep !== null
                    ? mutateShiftAll(mutated, decimalMode)
                    : mutateShiftOne(mutated, numberIndices, decimalMode);
            }
        } else if (technique === 'shiftRoot') {
            mutated = mutateShiftRoot(tokens, rootIndices, decimalMode);
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

// Пустой (визуально) корень: сам знак радикала отрисуется через MathJax,
// а содержимое — невидимый символ-пробел
const ROOT_EMPTY = '\\sqrt{⠀}';

// Для деталей: если корень стоит САМ ПО СЕБЕ (без множителя перед ним, "\sqrt{5}") —
// раскладываем на пустой плейсхолдер-корень + число, как раньше. Но если перед корнем
// сразу стоит число-множитель ("2\sqrt{5}") — корень НЕ разбираем: если бы тут тоже
// был пустой плейсхолдер, в банке оказались бы два неотличимых голых числа (множитель
// и число под корнем) без возможности понять, какое из них куда относится. Поэтому
// корень с множителем остаётся целым видимым кусочком ("\sqrt{5}"), а приманками для
// него служат другие целые корни ("\sqrt{3}", "\sqrt{8}"...), как это уже устроено в options.
function splitRootTokensForDetails(tokens) {
    const result = [];
    tokens.forEach((t, i) => {
        if (t.type !== 'root') { result.push(t); return; }

        const prev = tokens[i - 1];
        const hasCoefficient = !!prev && prev.type === 'number';

        if (hasCoefficient) {
            result.push({ ...t, wholeRoot: true });
        } else {
            result.push({ type: 'rootMark', value: ROOT_EMPTY });
            const numStr = String(t.num);
            const dotIdx = numStr.indexOf('.');
            const decimals = dotIdx === -1 ? 0 : numStr.length - dotIdx - 1;
            result.push({ type: 'number', value: numStr, num: t.num, separator: '.', decimals, fromRoot: true });
        }
    });
    return result;
}

// Разбирает одно число на составные кусочки: знак минус (если отрицательное),
// целая часть, разделитель и дробная часть (если есть дробь). Благодаря этому даже
// голое "-5" или "0,25" в качестве ВСЕГО ответа становится "собираемым" — в нём
// больше одного осмысленного кусочка. Разделитель всегда даём запятой, даже если
// в правильном ответе стояла точка — порядок кликов не зависит от символа, так что
// кусочек-запятая одинаково годится и как запятая, и как точка.
function splitNumberIntoPieces(token) {
    const isNegative = token.num < 0;
    const absNum = Math.abs(token.num);
    const pieces = [];
    if (isNegative) pieces.push({ type: 'sign', value: '-' });

    if (token.decimals > 0) {
        const fixed = absNum.toFixed(token.decimals);
        const [intStr, fracStr] = fixed.split('.');
        pieces.push({ type: 'number', value: intStr, num: parseFloat(intStr), decimals: 0, plainPart: true });
        pieces.push({ type: 'symbol', value: ',' });
        pieces.push({ type: 'number', value: fracStr, num: parseInt(fracStr, 10), decimals: 0, plainPart: true, padLength: fracStr.length });
    } else {
        const intStr = String(absNum);
        pieces.push({ type: 'number', value: intStr, num: parseFloat(intStr), decimals: 0, plainPart: true });
    }
    return pieces;
}

// Раскладывает на составные кусочки каждое число в списке токенов, у которого есть
// знак или дробная часть (иначе разбивать нечего — оставляем как было).
function expandNumbersForDetails(tokens) {
    const result = [];
    tokens.forEach(t => {
        if (t.type === 'number' && (t.num < 0 || t.decimals > 0)) {
            const subPieces = splitNumberIntoPieces(t);
            subPieces.forEach(sp => { if (sp.fromRoot === undefined) sp.fromRoot = t.fromRoot; });
            result.push(...subPieces);
        } else {
            result.push(t);
        }
    });
    return result;
}

// Общая логика для canBeDetails/buildDetailsFields: раскладываем число на знак/целую/
// запятую/дробную часть ТОЛЬКО если это число — единственный осмысленный кусок во
// всём ответе (иначе разбирать вообще было бы нечего, как с голым "5" или "-5").
// Если рядом уже есть что-то ещё ("0,2; 8", "2\sqrt{5}") — число остаётся целым,
// а приманками для него служат готовые целые числа (уже умеет обычный приём сдвига).
function meaningfulDetailsFilter(t) {
    return t.type === 'number' || t.type === 'rootMark' || t.value !== '';
}

// Для details лимит — 9 деталей суммарно (одна цифра на индекс в correctAnswer,
// см. как платформа хранит порядок: detailsSequence.join('') === task.correctAnswer).
// Индекс двузначным быть не может — значит больше 9 кусочков передать корректно нельзя.
const MAX_DETAILS = 9;

// Если кусочков получилось больше MAX_DETAILS — не отказываемся от details сразу,
// а схлопываем обратно самые необязательные: сначала скобки/знаки неравенства
// (теряем для них только отдельную приманку-замену, сама сборка не страдает),
// и только если совсем не помещается — склеиваем соседние текстовые куски.
// Числа, знак минуса и плейсхолдер-корень никогда не трогаем — это то, что
// действительно нужно собирать по смыслу.
function compactTokensForDetails(tokens) {
    let result = tokens.slice();
    let guard = 0;
    while (result.length > MAX_DETAILS && guard < 50) {
        guard++;
        let merged = false;

        for (let i = 0; i < result.length; i++) {
            if (result[i].type !== 'symbol') continue;
            if (result[i + 1] && result[i + 1].type === 'text') {
                result[i + 1] = { type: 'text', value: result[i].value + result[i + 1].value };
                result.splice(i, 1);
            } else if (result[i - 1] && result[i - 1].type === 'text') {
                result[i - 1] = { type: 'text', value: result[i - 1].value + result[i].value };
                result.splice(i, 1);
            } else {
                result[i] = { type: 'text', value: result[i].value }; // склеим на следующем шаге
            }
            merged = true;
            break;
        }
        if (merged) continue;

        for (let i = 0; i < result.length - 1; i++) {
            if (result[i].type === 'text' && result[i + 1].type === 'text') {
                result[i] = { type: 'text', value: result[i].value + result[i + 1].value };
                result.splice(i + 1, 1);
                merged = true;
                break;
            }
        }
        if (!merged) break; // больше нечего склеивать — сдаёмся
    }
    return result;
}

function getDetailsTokens(correctAnswer) {
    const rootSplitTokens = splitRootTokensForDetails(tokenizeAnswer(correctAnswer));
    const isAlone = rootSplitTokens.filter(meaningfulDetailsFilter).length === 1;
    let tokens = (isAlone ? expandNumbersForDetails(rootSplitTokens) : rootSplitTokens)
        .filter(meaningfulDetailsFilter);
    if (tokens.length > MAX_DETAILS) tokens = compactTokensForDetails(tokens).filter(meaningfulDetailsFilter);
    return tokens;
}

// Может ли ответ вообще быть "собран из деталей": нужно минимум 2 осмысленных куска
// (иначе, как с голым "5", разбирать нечего — это ровно один кусок), но не больше
// MAX_DETAILS даже после схлопывания — иначе индекс кусочка сломает correctAnswer.
function canBeDetails(correctAnswer) {
    const n = getDetailsTokens(correctAnswer).length;
    return n > 1 && n <= MAX_DETAILS;
}

function buildDetailsFields(correctAnswer, decimalMode) {
    const tokens = getDetailsTokens(correctAnswer);
    if (tokens.length <= 1 || tokens.length > MAX_DETAILS) return null;

    const numberIndices = tokens.map((t, i) => t.type === 'number' ? i : -1).filter(i => i !== -1);
    const symbolIndices = tokens.map((t, i) => t.type === 'symbol' ? i : -1).filter(i => i !== -1);
    const wholeRootIndices = tokens.map((t, i) => t.wholeRoot ? i : -1).filter(i => i !== -1);

    // Правильные кусочки — все токены по порядку
    const pieces = tokens.map((t, originalOrder) => ({ text: t.value, isCorrect: true, originalOrder }));

    // На каждое число добавляем до двух приманок — сдвиг и смену знака, если применимо
    // (одной приманки маловато, особенно когда в ответе всего одно число). Приманка не
    // должна совпадать ни с одним уже имеющимся кусочком — включая другие правильные
    // (иначе, например, приманка для "4" может случайно вылезти как ещё одна "5").
    const usedDecoyValues = new Set(pieces.map(p => p.text));
    for (const idx of numberIndices) {
        const token = tokens[idx];
        let added = 0;

        if (token.fromRoot) {
            // для числа под корнем нужны гарантированно две РАЗНЫЕ неправильные версии
            // (по вашему требованию) — подбираем их в цикле заново при совпадении,
            // а не по фиксированному списку из трёх кандидатов, где могло не повезти
            let attempts = 0;
            while (added < 2 && attempts < 20 && pieces.length < MAX_DETAILS) {
                attempts++;
                const decoyNum = token.num + randomDeltaForToken(token, decimalMode);
                const decoyText = formatNumber(decoyNum, token);
                if (usedDecoyValues.has(decoyText)) continue;
                usedDecoyValues.add(decoyText);
                pieces.push({ text: decoyText, isCorrect: false });
                added++;
            }
            continue;
        }

        if (token.plainPart) {
            // кусочек — часть разложенного числа (целая или дробная часть без знака,
            // знак уже отдельный кусочек) — приманки только сдвигом, без смены знака,
            // и с сохранением ширины (для дробной части: "05", а не "5")
            let attempts = 0;
            while (added < 2 && attempts < 20 && pieces.length < MAX_DETAILS) {
                attempts++;
                const magnitude = 1 + Math.floor(Math.random() * 3);
                let decoyNum = token.num + (Math.random() < 0.5 ? magnitude : -magnitude);
                if (decoyNum < 0) decoyNum = Math.abs(decoyNum);
                let decoyText = String(decoyNum);
                if (token.padLength) decoyText = decoyText.padStart(token.padLength, '0').slice(-token.padLength);
                if (decoyText === token.value || usedDecoyValues.has(decoyText)) continue;
                usedDecoyValues.add(decoyText);
                pieces.push({ text: decoyText, isCorrect: false });
                added++;
            }
            continue;
        }

        const candidates = [];
        candidates.push(token.num + randomDeltaForToken(token, decimalMode));               // сдвиг №1
        candidates.push(token.num + randomDeltaForToken(token, decimalMode));               // сдвиг №2 (другое число)

        for (const decoyNum of candidates) {
            if (pieces.length >= MAX_DETAILS || added >= 2) break;
            const decoyText = formatNumber(decoyNum, token);
            if (usedDecoyValues.has(decoyText)) continue;
            usedDecoyValues.add(decoyText);
            pieces.push({ text: decoyText, isCorrect: false });
            added++;
        }
    }

    // На каждую скобку/знак неравенства тоже добавляем противоположную версию-приманку
    for (const idx of symbolIndices) {
        if (pieces.length >= MAX_DETAILS) break;
        const token = tokens[idx];
        const decoyText = SWAP_MAP[token.value];
        if (!decoyText || decoyText === token.value || usedDecoyValues.has(decoyText)) continue;
        usedDecoyValues.add(decoyText);
        pieces.push({ text: decoyText, isCorrect: false });
    }

    // Корень с множителем ("2\sqrt{5}") остался целым кусочком — приманки для него
    // тоже целые альтернативные корни ("\sqrt{3}", "\sqrt{8}"...), а не разобранные части.
    // Гарантируем минимум 2 разных приманки, как и для обычного числа под корнем.
    for (const idx of wholeRootIndices) {
        const token = tokens[idx];
        let added = 0;
        let attempts = 0;
        while (added < 2 && attempts < 20 && pieces.length < MAX_DETAILS) {
            attempts++;
            let decoyNum = token.num + randomDeltaForToken(token, decimalMode);
            if (decoyNum < 0) decoyNum = Math.abs(decoyNum) + 1; // под корнем не бывает отрицательного
            const decoyText = formatRoot(decoyNum, token.format);
            if (decoyText === token.value || usedDecoyValues.has(decoyText)) continue;
            usedDecoyValues.add(decoyText);
            pieces.push({ text: decoyText, isCorrect: false });
            added++;
        }
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
    const hasMutableNumber = tokens.some(t => t.type === 'number' || t.type === 'root');
    const types = ['input'];
    if (hasMutableNumber) types.push('options');
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

    // считаем доступные типы для каждого задания заранее
    const meta = inputTasks.map(task => ({
        task,
        available: getAvailableTypes(task.correctAnswer)
    }));

    // перемешиваем порядок — иначе при небольших квотах всегда конвертируются
    // одни и те же "первые по счёту" задания урока, а остальные остаются input
    for (let i = meta.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [meta[i], meta[j]] = [meta[j], meta[i]];
    }
    // и только после перемешивания — самые "зажатые" задания вперёд, чтобы они
    // не остались без своего единственного варианта из-за более гибких соседей
    meta.sort((a, b) => a.available.length - b.available.length);

    // input — явное меньшинство: на нём базовая треть без довеска. Остаток от
    // деления уходит не в input, а в options (и, если остаток больше 1, в details) —
    // например для 7 заданий получится 3 options, 2 details, 2 input, а не наоборот
    const base = Math.floor(n / 3);
    const remainder = n % 3;
    const quotas = {
        input: base,
        options: base + (remainder >= 1 ? 1 : 0),
        details: base + (remainder >= 2 ? 1 : 0)
    };

    // если заданий, реально способных стать details, меньше, чем задумано в квоте —
    // не резервируем под них место впустую, а сразу отдаём разницу под options
    const eligibleDetailsCount = meta.filter(m => m.available.includes('details')).length;
    if (quotas.details > eligibleDetailsCount) {
        quotas.options += quotas.details - eligibleDetailsCount;
        quotas.details = eligibleDetailsCount;
    }

    const leftovers = []; // задания, которым в первый проход не хватило квоты

    meta.forEach(item => {
        const { task, available } = item;
        const preferenceOrder = ['options', 'details', 'input'].filter(t => available.includes(t));
        const chosen = preferenceOrder.find(t => quotas[t] > 0);
        if (!chosen) { leftovers.push(item); return; } // пока квоты нет — попробуем во втором проходе

        if (chosen === 'options') {
            const fields = buildOptionsFields(task.correctAnswer, 4, decimalMode);
            if (fields) { Object.assign(task, fields); quotas.options--; return; }
        }
        if (chosen === 'details') {
            const fields = buildDetailsFields(task.correctAnswer, decimalMode);
            if (fields) { Object.assign(task, fields); quotas.details--; return; }
        }
        if (chosen === 'input' && quotas.input > 0) { quotas.input--; return; }
        leftovers.push(item);
    });

    // квота, для которой не нашлось подходящих заданий (например, details, когда все
    // оставшиеся ответы для него не годятся), не должна пропадать зря — отдаём её
    // тем, кто остался без типа, предпочитая options
    leftovers.forEach(({ task, available }) => {
        const preferenceOrder = ['options', 'details'].filter(t => available.includes(t));
        const chosen = preferenceOrder.find(t => quotas[t] > 0);

        if (chosen === 'options') {
            const fields = buildOptionsFields(task.correctAnswer, 4, decimalMode);
            if (fields) { Object.assign(task, fields); quotas.options--; return; }
        }
        if (chosen === 'details') {
            const fields = buildDetailsFields(task.correctAnswer, decimalMode);
            if (fields) { Object.assign(task, fields); quotas.details--; return; }
        }
        // свободной квоты больше нигде нет — задание остаётся input
    });

    return tasks;
}


/* ===================================================
   Точка входа
   =================================================== */

function isNotInputTask(task) {
    return !!task && typeof task.type === 'string' && task.type.trim().toLowerCase() === 'notinput';
}

// Задания с type:"notinput" ОБЯЗАНЫ стать options или details — input для них
// исключён совсем. В отличие от обычных input-заданий, они не участвуют в квотах
// урока (квоты существуют, чтобы часть заданий сознательно осталась input — а тут
// такого исхода в принципе не бывает), поэтому обрабатываются отдельным проходом.
function forceConvertNotInputTasks(tasks) {
    const notInputTasks = tasks.filter(isNotInputTask);
    if (notInputTasks.length === 0) return;
    const decimalMode = isLessonAllDecimal(notInputTasks);

    notInputTasks.forEach(task => {
        const available = getAvailableTypes(task.correctAnswer).filter(t => t !== 'input');
        if (available.length === 0) return; // см. предупреждение в ответе — крайний случай

        // порядок предпочтения перемешиваем, чтобы не всегда доставался один и тот же тип
        const order = Math.random() < 0.5 ? ['options', 'details'] : ['details', 'options'];
        for (const type of order) {
            if (!available.includes(type)) continue;
            const fields = type === 'options'
                ? buildOptionsFields(task.correctAnswer, 4, decimalMode)
                : buildDetailsFields(task.correctAnswer, decimalMode);
            if (fields) { Object.assign(task, fields); return; }
        }
    });
}

// Вызывается при открытии урока: tasks — массив заданий урока (как они лежат в JSON).
// theory-задания не трогаются вообще. input — через квоты (planLessonTypes).
// notinput — принудительно в options/details (forceConvertNotInputTasks).
function autoGenerateLesson(tasks) {
    planLessonTypes(tasks);
    forceConvertNotInputTasks(tasks);
    return tasks;
}