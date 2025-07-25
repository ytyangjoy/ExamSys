/**
 * 全域變數定義
 */
// Shallow Freeze (unused)
// const QUESTION_RANGE = Object.freeze({
//     MIN: 10,
//     MAX: 65
// });
// Non-Freeze
var QUESTION_RANGE = {
    MIN: 1,
    MAX: 65
};

// 使用 WeakMap 來存儲暫時性的題目數據
const questionCache = new Map();

// 考試狀態相關
let examState = {
    questionBank: null,      // 題庫
    currentQuestions: 0,  // 當前考試題目
    currentIndex: 0,      // 當前題目索引
    userAnswers: new Map(),      // 使用者答案
    markedQuestions: new Set(), // 標記的題目
    wrongQuestions: null,   // 錯誤的題目
    questionSequence: null, // 題目順序
    questionCount: 65,    // 題目數量 (Default 65)
    isFromReview: false,   // 是否從檢視畫面返回
    currentFileName: null  // 讀取檔名
};

// 計時器相關
const timerState = Object.seal({
    examTimer: null,
    startTime: null
});

/**
 * 檔案匯入相關函數
 */
async function handleFileImport(event) {
    // RESET VARIABLE
    QUESTION_RANGE.MIN = 1;

    const file = event.target.files[0];
    if (!file) {
        showAlert('請選擇檔案');
        return;
    } else {
        // 儲存檔案名稱
        const fullFileName = file.name;

        // 純檔名
        const fileName = fullFileName.replace(/\.[^/.]+$/, "");

        // 將檔名存入 examState
        examState.currentFileName = fileName;

        // 更新考試主題
        document.getElementById('exam-name').textContent=examState.currentFileName;
    }

    try {
        // 使用 chunk 方式讀取大文件
        const chunks    = await readFileInChunks(file);
        const questions = await parseQuestionsFromChunks(chunks);
        
        examState.questionBank = questions;
        document.getElementById('start-exam-btn').disabled = false;

        const questionPopup    = document.getElementById("question-count-input");
        const questionPopupMin = document.getElementById("question-count-min");
        const questionPopupMax = document.getElementById("question-count-max");

        // 檢查並更新最低題數(if <= 10), 目前暫停最少1題
        // if (1 <= questions.length && questions.length <= 10) {
        //     QUESTION_RANGE.MIN = 1;
        // } else {
        //     QUESTION_RANGE.MIN = 10;
        // }
        questionPopup.setAttribute("min", QUESTION_RANGE.MIN);
        questionPopup.setAttribute("value", QUESTION_RANGE.MIN);
        questionPopupMin.textContent = QUESTION_RANGE.MIN;

        // 更新出題上限
        QUESTION_RANGE.MAX = questions.length;
        questionPopup.setAttribute("max", QUESTION_RANGE.MAX);
        questionPopupMax.textContent = QUESTION_RANGE.MAX;

        showAlert(`題目匯入成功！共匯入 ${questions.length} 題`);
    } catch (error) {
        console.error('匯入錯誤:', error);
        showAlert('題目匯入失敗：' + error.message);
    } finally {
        event.target.value = '';
    }
}

// 切chunks分塊讀取大文件
function readFileInChunks(file, chunkSize = 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const reader = new FileReader();
        let offset = 0;

        reader.onload = function(e) {
            chunks.push(e.target.result);
            if (offset < file.size) {
                readNextChunk();
            } else {
                resolve(chunks.join(''));
            }
        };

        reader.onerror = reject;

        function readNextChunk() {
            const slice = file.slice(offset, offset + chunkSize);
            reader.readAsText(slice);
            offset += chunkSize;
        }

        readNextChunk();
    });
}

// 題目解析
async function parseQuestionsFromChunks(text) {
    try {
        const data = JSON.parse(text);
        const questions = [];
        const batchSize = 20; // 每批處理的題目數
        
        // 使用 generator 分批處理題目
        for (const batch of processByBatch(data, batchSize)) {
            const parsedQuestions = await processBatch(batch);
            questions.push(...parsedQuestions);
            
            // 允許其他任務執行
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        validateQuestionCount(questions);
        return questions;
    } catch (error) {
        console.error('解析題目時發生錯誤:', error);
        throw new Error('題目格式不正確或解析失敗');
    }
}

/**
 * Generator 函數用於分批處理
 */
function* processByBatch(data, batchSize) {
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i += batchSize) {
        const batch = {};
        for (let j = i; j < Math.min(i + batchSize, keys.length); j++) {
            batch[keys[j]] = data[keys[j]];
        }
        yield batch;
    }
}

/**
 * 處理每一批題目的函數
 */
async function processBatch(batch) {
    const batchQuestions = [];
    
    try {
        for (const [questionKey, questionData] of Object.entries(batch)) {
            if (questionData) {
                validateQuestionFormat(questionData, questionKey);
                const formattedQuestion = formatQuestionData(questionData, questionKey);
                batchQuestions.push(formattedQuestion);
            }
        }
        return batchQuestions;
    } catch (error) {
        console.error('處理題目批次時發生錯誤:', error);
        throw error;
    }
}

/**
 * JSON 解析函數
 */
function parseJsonQuestions(text) {
    try {
        const data = JSON.parse(text);
        const questions = [];
        
        for (let i = 1; i <= 88; i++) {
            const questionKey = `Q${i}`;
            const questionData = data[questionKey];
            
            if (questionData) {
                validateQuestionFormat(questionData, questionKey);
                questions.push(formatQuestionData(questionData, questionKey));
            }
        }
        
        validateQuestionCount(questions);
        return questions;
    } catch (error) {
        console.error('解析錯誤:', error);
        throw error;
    }
}

/**
 * 驗證題目格式
 */
function validateQuestionFormat(questionData, questionKey) {
    if (!questionData.Question || 
        typeof questionData.Options !== 'object' || 
        !Array.isArray(questionData.Answer)) {
        throw new Error(`題目 ${questionKey} 格式不正確`);
    }

    const optionKeys = Object.keys(questionData.Options);
    if (!questionData.Answer.every(ans => optionKeys.includes(ans))) {
        throw new Error(`題目 ${questionKey} 的答案不在選項中`);
    }
}

/**
 * 格式化題目數據
 */
function formatQuestionData(questionData, questionKey) {
    return {
        id: questionKey,
        Question: questionData.Question,
        Options: questionData.Options,
        OptionKeys: Object.keys(questionData.Options),
        Answer: questionData.Answer,
        Explanation: questionData.explanation || [], // 加入解析欄位
        shuffledOptionMap: {} // 用於存儲打亂後的選項對應關係
    };
}

/**
 * 驗證題目數量
 */
function validateQuestionCount(questions) {
    if (questions.length === 0) {
        throw new Error('未找到有效題目');
    }
    
    if (questions.length < QUESTION_RANGE.MIN) {
        throw new Error(
            `題目數量不足，至少需要${QUESTION_RANGE.MIN}題，` +
            `目前只有 ${questions.length} 題`
        );
    }
}

/**
 * 考試控制相關函數
 */
function showExamMode() {
    if (!examState.questionBank || examState.questionBank.length === 0) {
        showAlert('請先匯入題目！');
        return;
    }
    showQuestionCountPopup();
}

function showQuestionCountPopup() {
    const popup = document.getElementById('question-count-popup');
    popup.style.display = 'flex';
}

function cancelQuestionCountSelection() {
    document.getElementById('question-count-popup').style.display = 'none';
}

function confirmQuestionCount() {
    const input = document.getElementById('question-count-input');
    const count = parseInt(input.value);
    
    if (isInvalidQuestionCount(count)) {
        showAlert(`請輸入有效的題數（${QUESTION_RANGE.MIN}-${QUESTION_RANGE.MAX}題）`);
        return;
    }
    
    examState.questionCount = count;
    document.getElementById('question-count-popup').style.display = 'none';
    startExam();
}

function isInvalidQuestionCount(count) {
    return isNaN(count) || 
           count < QUESTION_RANGE.MIN || 
           count > QUESTION_RANGE.MAX;
}

function startExam() {
    try {
        console.log('開始考試', {
            questionBankLength: examState.questionBank.length,
            requestedCount: examState.questionCount
        });

        // 清理之前的快取
        questionCache.clear();
        
        // 初始化考試
        initializeExam();
        
        // 開始計時
        startTimer();
        
        // 顯示考試畫面
        showScreen('exam-screen');
        
        // 更新第一題
        updateQuestion();

    } catch (error) {
        console.error('開始考試時發生錯誤:', error);
        showAlert('開始考試時發生錯誤：' + error.message);
        // 錯誤發生時返回首頁
        navigateToHome();
    }
}

function initializeExam() {
    try {
        // 檢查題庫是否存在且有效
        if (!examState.questionBank || examState.questionBank.length === 0) {
            throw new Error('題庫未載入或無效');
        }

        // 生成隨機序列
        const sequence = generateRandomSequence(
            examState.questionBank.length,
            examState.questionCount
        );
        
        examState.questionSequence = sequence;
        examState.currentIndex = 0;
        examState.userAnswers = new Map();
        examState.markedQuestions = new Set();
        examState.wrongQuestions = [];
        examState.isFromReview = false;

        console.log('考試初始化完成', {
            sequenceLength: sequence.length,
            questionCount: examState.questionCount,
            currentIndex: examState.currentIndex
        });
    } catch (error) {
        console.error('初始化考試時發生錯誤:', error);
        throw error;
    }
}

// 延遲載入題目
function loadCurrentQuestion() {
    try {
        const questionIndex = examState.questionSequence[examState.currentIndex];
        const originalQuestion = examState.questionBank[questionIndex];
        
        if (!originalQuestion) {
            throw new Error('無法找到當前題目');
        }

        const questionKey = originalQuestion.id;
        
        if (!questionCache.has(questionKey)) {
            const question = prepareQuestion(originalQuestion);
            questionCache.set(questionKey, question);
        }

        return questionCache.get(questionKey);
    } catch (error) {
        console.error('載入題目時發生錯誤:', error);
        throw error;
    }
}

// 準備題目顯示數據
function prepareQuestion(originalQuestion) {
    try {
        if (!originalQuestion || !originalQuestion.Options) {
            throw new Error('題目資料格式無效');
        }

        const question = {
            id: originalQuestion.id,
            Question: originalQuestion.Question,
            Answer: originalQuestion.Answer,
            optionMap: new Map()
        };

        // 獲取原始選項鍵值並排序
        const originalKeys = Object.keys(originalQuestion.Options);
        
        // 隨機打亂選項順序
        const shuffledKeys = shuffleArray([...originalKeys]);

        // 建立選項映射
        shuffledKeys.forEach((originalKey, index) => {
            const displayKey = String.fromCharCode(65 + index); // ASCII Counting
            question.optionMap.set(displayKey, {
                originalKey: originalKey,
                text: originalQuestion.Options[originalKey]
            });
        });

        // 添加除錯資訊
        // console.log('題目準備完成:', {
        //     questionId: question.id,
        //     optionsCount: question.optionMap.size
        // });

        return question;

    } catch (error) {
        console.error('準備題目時發生錯誤:', error);
        throw error;
    }
}

// 新增快取大小控制
function manageCacheSize(maxSize = 100) {
    if (questionCache.size > maxSize) {
        const keysIterator = questionCache.keys();
        // 移除最舊的項目直到快取大小符合限制
        for (let i = 0; i < questionCache.size - maxSize; i++) {
            const key = keysIterator.next().value;
            questionCache.delete(key);
        }
    }
}

/**
 * 定時器相關函數
 */
function startTimer() {
    timerState.startTime = new Date();
    timerState.examTimer = setInterval(updateTimer, 1000);
}

function stopTimer() {
    if (timerState.examTimer) {
        clearInterval(timerState.examTimer);
        timerState.examTimer = null;
    }
}

function updateTimer() {
    const now = new Date();
    const diff = Math.floor((now - timerState.startTime) / 1000);
    const minutes = Math.floor(diff / 60).toString().padStart(2, '0');
    const seconds = (diff % 60).toString().padStart(2, '0');
    document.getElementById('exam-timer').textContent = `${minutes}:${seconds}`;
}

/**
 * 題目顯示相關函數
 */
function updateQuestion() {
    try {
        if (!canUpdateQuestion()) {
            throw new Error('無法更新題目：題目狀態無效');
        }

        const question = loadCurrentQuestion();
        
        // 使用 DocumentFragment 優化 DOM 操作
        const fragment = document.createDocumentFragment();
        
        // 更新題目文字
        updateQuestionText(question, fragment);
        
        // 更新選項
        updateOptions(question, fragment);
        
        // 批次更新 DOM
        const container = document.getElementById('question-options-container');
        container.innerHTML = '';
        container.appendChild(fragment);
        
        // 更新進度和導航
        requestAnimationFrame(() => {
            updateProgress();
            updateNavigation();
        });

    } catch (error) {
        console.error('更新題目時發生錯誤:', error);
        showAlert('載入題目時發生錯誤：' + error.message);
    }
}

function canUpdateQuestion() {
    try {
        // 檢查題目序列是否存在
        if (!examState.questionSequence) {
            console.error('題目序列未初始化');
            return false;
        }

        // 檢查當前索引是否有效
        if (examState.currentIndex < 0 || 
            examState.currentIndex >= examState.questionCount) {
            console.error('當前題目索引無效:', examState.currentIndex);
            return false;
        }

        // 檢查是否能獲取到題目
        const questionIndex = examState.questionSequence[examState.currentIndex];
        if (questionIndex === undefined || 
            !examState.questionBank[questionIndex]) {
            console.error('無法獲取題目:', {
                questionIndex,
                currentIndex: examState.currentIndex
            });
            return false;
        }

        return true;
    } catch (error) {
        console.error('檢查題目狀態時發生錯誤:', error);
        return false;
    }
}

function updateQuestionText(question, actualQuestionIndex) {
    const container = document.getElementById('current-question-container');
    container.innerHTML = `
        <div class="question-id">原始題號：${question.id}</div>
        <div class="question-text">${question.Question}</div>
    `;
}

function updateProgress() {
    // 更新題號和進度百分比
    const currentNum = examState.currentIndex + 1;
    document.getElementById('current-question-number').textContent = currentNum;
    document.getElementById('total-questions-number').textContent = examState.questionCount;
    
    // 更新進度條
    const progress = (currentNum / examState.questionCount) * 100;
    document.getElementById('exam-progress-bar').style.width = `${progress}%`;
    document.getElementById('exam-progress-percentage').textContent = 
        `${Math.round(progress)}%`;
}

/**
 * 選項處理相關函數
 */
function updateOptions(question, fragment) {
    try {
        // 檢查參數
        if (!question || !question.optionMap) {
            throw new Error('題目或選項資料無效');
        }

        // 創建選項容器
        const container = document.createElement('div');
        container.className = 'options-container';

        // 獲取排序後的選項鍵值
        const sortedKeys = Array.from(question.optionMap.keys()).sort();

        // 建立選項元素
        sortedKeys.forEach(displayKey => {
            const optionData = question.optionMap.get(displayKey);
            if (!optionData) {
                console.warn(`選項資料不存在: ${displayKey}`);
                return;
            }

            const optionElement = createOptionElement(
                displayKey,
                optionData.originalKey,
                question.id,
                optionData.text
            );
            container.appendChild(optionElement);
        });

        // 將選項容器添加到 fragment
        fragment.appendChild(container);

    } catch (error) {
        console.error('更新選項時發生錯誤:', error);
        throw error;
    }
}

function createOptionElement(displayKey, originalKey, questionId, optionText) {
    try {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option-item';

        // 創建 checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `option-${questionId}-${displayKey}`;
        checkbox.checked = isOptionSelected(originalKey, questionId);

        // 創建標籤
        const label = document.createElement('label');
        label.htmlFor = `option-${questionId}-${displayKey}`;
        label.className = 'option-text';
        label.innerHTML = `<span class="option-label">${displayKey}.</span> ${optionText}`;

        // 添加事件監聽
        const handleClick = (e) => {
            e.preventDefault();
            checkbox.checked = !checkbox.checked;
            handleOptionSelect(originalKey, questionId);
        };

        // 將 checkbox 和標籤添加到選項容器
        optionDiv.appendChild(checkbox);
        optionDiv.appendChild(label);

        // 為整個選項區域添加點擊事件
        optionDiv.addEventListener('click', handleClick);
        
        // 為 checkbox 添加單獨的點擊事件
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            handleOptionSelect(originalKey, questionId);
        });

        return optionDiv;

    } catch (error) {
        console.error('創建選項元素時發生錯誤:', error);
        throw error;
    }
}

/**
 * 選項狀態檢查
 */
function isOptionSelected(originalKey, questionId) {
    try {
        const answers = examState.userAnswers.get(questionId);
        return answers ? answers.includes(originalKey) : false;
    } catch (error) {
        console.error('檢查選項狀態時發生錯誤:', error);
        return false;
    }
}

/**
 * 選項選擇處理
 */
function handleOptionSelect(originalKey, questionId) {
    try {
        let currentAnswers = examState.userAnswers.get(questionId) || [];
        
        if (currentAnswers.includes(originalKey)) {
            currentAnswers = currentAnswers.filter(key => key !== originalKey);
        } else {
            currentAnswers = [...currentAnswers, originalKey];
        }

        examState.userAnswers.set(questionId, currentAnswers);

        // 添加除錯資訊
        // console.log('更新答案:', {
        //     questionId,
        //     selectedOptions: currentAnswers
        // });

    } catch (error) {
        console.error('處理選項選擇時發生錯誤:', error);
        showAlert('處理選項時發生錯誤');
    }
}

/**
 * 導航相關函數
 */
function updateNavigation() {
    try {
        const prevBtn = document.getElementById('previous-question-btn');
        const nextBtn = document.getElementById('next-question-btn');
        const backToPreviewBtn = document.getElementById('back-to-preview-btn');
        
        // 檢查是否為第一題
        prevBtn.disabled = examState.currentIndex === 0;

        // 檢查是否為最後一題
        const isLastQuestion = examState.currentIndex === (examState.questionCount - 1);
        nextBtn.textContent = isLastQuestion ? '檢視作答' : '下一題';
        nextBtn.onclick = isLastQuestion ? navigateToPreview : navigateToNextQuestion;

        // 更新返回預覽按鈕的顯示狀態
        backToPreviewBtn.style.display = examState.isFromReview ? 'block' : 'none';

        // 更新題目標記狀態
        updateMarkStatus();

        // debug used
        // console.log('更新導航按鈕:', {
        //     currentIndex: examState.currentIndex,
        //     totalQuestions: examState.questionCount,
        //     isLastQuestion: isLastQuestion
        // });

    } catch (error) {
        console.error('更新導航按鈕時發生錯誤:', error);
    }
}

/**
 * 檢查是否為最後一題
 */
function isLastQuestion() {
    return examState.currentIndex === (examState.questionCount - 1);
}

function updateMarkStatus() {
    const markSwitch = document.getElementById('mark-question-switch');
    const actualQuestionIndex = examState.questionSequence[examState.currentIndex] - 1;
    markSwitch.checked = examState.markedQuestions.has(actualQuestionIndex);
}

function navigateToPreviousQuestion() {
    if (examState.currentIndex > 0) {
        examState.currentIndex--;
        updateQuestion();
    }
}

function navigateToNextQuestion() {
    try {
        if (isLastQuestion()) {
            navigateToPreview(); // 最後一題時導向檢視頁面
        } else {
            examState.currentIndex++;
            updateQuestion();
        }
    } catch (error) {
        console.error('導航到下一題時發生錯誤:', error);
        showAlert('導航時發生錯誤');
    }
}

function navigateToPreview() {
    try {
        showExamPreview();
    } catch (error) {
        console.error('導航到檢視頁面時發生錯誤:', error);
        showAlert('無法進入檢視頁面');
    }
}

function navigateToExam() {
    showScreen('exam-screen');
}

function navigateToHome() {
    cleanupExam();
    showScreen('home-screen');
}

/**
 * 題目標記相關函數
 */
function toggleQuestionMark() {
    const checkbox = document.getElementById('mark-question-switch');
    const actualQuestionIndex = examState.questionSequence[examState.currentIndex] - 1;
    
    if (checkbox.checked) {
        examState.markedQuestions.add(actualQuestionIndex);
    } else {
        examState.markedQuestions.delete(actualQuestionIndex);
    }
}

/**
 * 檢視畫面相關函數
 */
// 檢視頁面顯示
function showExamPreview() {
    try {
        // 更新標記的題目
        updateMarkedQuestions();
        
        // 更新未作答的題目
        updateUnansweredQuestions();
        
        // 顯示檢視頁面
        showScreen('preview-screen');

        // debug used
        // console.log('顯示檢視頁面:', {
        //     markedCount: examState.markedQuestions.size,
        //     answeredCount: examState.userAnswers.size,
        //     totalQuestions: examState.questionCount
        // });

    } catch (error) {
        console.error('顯示檢視頁面時發生錯誤:', error);
        showAlert('無法顯示檢視頁面');
    }
}

function updateMarkedQuestions() {
    const markedGrid = document.getElementById('marked-questions-grid');
    markedGrid.innerHTML = '';

    examState.markedQuestions.forEach(actualIndex => {
        const displayIndex = examState.questionSequence.indexOf(actualIndex + 1);
        if (displayIndex !== -1) {
            createPreviewItem(markedGrid, displayIndex, 'marked');
        }
    });
}

/**
 * 檢視作答頁面更新
 */
function updateUnansweredQuestions() {
    try {
        const unansweredGrid = document.getElementById('unanswered-questions-grid');
        unansweredGrid.innerHTML = '';

        // 檢查每一題的作答狀況
        for (let i = 0; i < examState.questionCount; i++) {
            const questionIndex = examState.questionSequence[i];
            const question = examState.questionBank[questionIndex];
            
            if (!question) {
                console.warn(`無法找到索引 ${questionIndex} 的題目`);
                continue;
            }

            // 使用 Map 檢查答案是否存在
            const userAnswer = examState.userAnswers.get(question.id);
            
            // 如果答案不存在或是空陣列，則為未作答
            if (!userAnswer || userAnswer.length === 0) {
                createPreviewItem(unansweredGrid, i, 'unanswered');
            }
        }

        // debug used
        // console.log('更新未作答題目清單:', {
        //     totalQuestions: examState.questionCount,
        //     answeredCount: examState.userAnswers.size
        // });

    } catch (error) {
        console.error('更新未作答題目時發生錯誤:', error);
    }
}

/**
 * 創建預覽項目
 */
function createPreviewItem(container, index, className) {
    try {
        const div = document.createElement('div');
        div.className = `review-item ${className}`;
        
        // 顯示題號（從1開始）
        const questionNumber = index + 1;
        div.textContent = `第 ${questionNumber} 題`;
        
        // 添加點擊事件
        div.onclick = () => jumpToQuestion(index);
        
        container.appendChild(div);

        return div;
    } catch (error) {
        console.error('創建預覽項目時發生錯誤:', error);
    }
}

/**
 * 跳轉到指定題目
 */
function jumpToQuestion(index) {
    try {
        if (index < 0 || index >= examState.questionCount) {
            throw new Error('無效的題目索引');
        }

        examState.currentIndex = index;
        examState.isFromReview = true;
        showScreen('exam-screen');
        updateQuestion();

        // debug used
        // console.log('跳轉到題目:', {
        //     questionIndex: index,
        //     currentIndex: examState.currentIndex
        // });

    } catch (error) {
        console.error('跳轉到題目時發生錯誤:', error);
        showAlert('無法跳轉到指定題目');
    }
}

/**
 * 考試結果相關函數
 */
function submitExam() {
    try {
        if (confirm('確定要提交答案嗎？')) {
            stopTimer();
            const score = calculateScore();
            showExamResult(score);
            showScreen('result-screen');
        }
    } catch (error) {
        console.error('提交答案時發生錯誤:', error);
        showAlert('提交答案時發生錯誤');
    }
}

function calculateScore() {
    try {
        let correctCount = 0;
        examState.wrongQuestions = [];

        // 檢查題目序列是否存在
        if (!examState.questionSequence || examState.questionSequence.length === 0) {
            throw new Error('找不到題目序列');
        }

        // 使用 questionSequence 來遍歷題目
        for (let i = 0; i < examState.questionCount; i++) {
            const questionIndex = examState.questionSequence[i];
            const question = examState.questionBank[questionIndex];
            
            if (!question) {
                console.warn(`無法找到索引 ${questionIndex} 的題目`);
                continue;
            }

            // 使用 Map 正確獲取使用者答案
            const userAnswer = examState.userAnswers.get(question.id) || [];
            
            // 檢查答案是否正確
            if (isAnswerCorrect(userAnswer, question.Answer)) {
                correctCount++;
            } else {
                recordWrongQuestion(question, i, userAnswer);
            }
        }

        // 計算並回傳分數
        const score = Math.round((correctCount / examState.questionCount) * 100);
        
        console.log('計算分數完成:', {
            correctCount,
            totalQuestions: examState.questionCount,
            score: score,
            wrongQuestions: examState.wrongQuestions.length
        });

        return score;

    } catch (error) {
        console.error('計算分數時發生錯誤:', error);
        throw error;
    }
}

/**
 * 檢查答案正確性
 */
function isAnswerCorrect(userAnswer, correctAnswer) {
    try {
        // 檢查參數
        if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer)) {
            console.warn('答案格式無效');
            return false;
        }

        // 檢查答案數量是否相同
        if (userAnswer.length !== correctAnswer.length) {
            return false;
        }

        // 檢查每個答案是否都存在於正確答案中
        return userAnswer.every(answer => correctAnswer.includes(answer));

    } catch (error) {
        console.error('檢查答案時發生錯誤:', error);
        return false;
    }
}

function recordWrongQuestion(question, index, userAnswer) {
    try {
        if (!question) {
            console.warn('記錄錯題時發現無效的題目');
            return;
        }

        examState.wrongQuestions.push({
            questionNumber: index + 1,
            originalId: question.id,
            question: question,
            userAnswer: userAnswer
        });

        // console.log('記錄錯題:', {
        //     questionNumber: index + 1,
        //     questionId: question.id,
        //     userAnswer: userAnswer
        // });

    } catch (error) {
        console.error('記錄錯題時發生錯誤:', error);
    }
}

/**
 * 考試結果顯示相關函數
 */
function showExamResult(score) {
    document.getElementById('final-score').textContent = score;
    showWrongQuestions();
}

function showWrongQuestions() {
    const container = document.getElementById('wrong-questions-list');
    container.innerHTML = '';

    examState.wrongQuestions.forEach(item => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';
        questionDiv.innerHTML = createWrongQuestionHTML(item);
        container.appendChild(questionDiv);
    });
    
    // 確保按鈕文字正確
    updateExplanationButtonText(false);
}

function createWrongQuestionHTML(item) {
    return `
        <div class="question-number">
            第 ${item.questionNumber} 題（原始題號：${item.originalId}）
        </div>
        <div class="question">${item.question.Question}</div>
        <div class="options">
            ${createWrongQuestionOptionsHTML(item)}
        </div>
        <div class="answer-text">
            <div class="correct-answer">
                正確答案：${formatAnswerText(item.question)}
            </div>
            <div class="user-answer ${item.userAnswer.length === 0 ? 'no-answer' : ''}">
                你的答案：${formatWrongQuestionUserAnswer(item)}
            </div>
        </div>
        <div class="explanation-section" style="display: none;">
            <div class="explanation-header">📚 詳細解析</div>
            <div class="explanation-content">${formatExplanationText(item.question.Explanation)}</div>
        </div>
    `;
}

function createWrongQuestionOptionsHTML(item) {
    return item.question.OptionKeys.map((key, index) => {
        const displayKey = String.fromCharCode(65 + index);
        return `
            <div class="option 
                ${item.question.Answer.includes(key) ? 'correct' : ''} 
                ${item.userAnswer.includes(key) ? 'user-selected' : ''}">
                <span class="option-label">${displayKey}.</span>
                ${item.question.Options[key]}
            </div>
        `;
    }).join('');
}

function formatAnswerText(question) {
    return question.Answer.map(key => 
        `${key}. ${question.Options[key]}`
    ).join('<br>');
}

function formatWrongQuestionUserAnswer(item) {
    if (item.userAnswer.length === 0) return '未作答';
    
    return item.userAnswer.map(originalKey => {
        const index = item.question.OptionKeys.indexOf(originalKey);
        const displayKey = String.fromCharCode(65 + index);
        return `${displayKey}. ${item.question.Options[originalKey]}`;
    }).join('、');
}

/**
 * 格式化解析文字
 */
function formatExplanationText(explanation) {
    if (!explanation || !Array.isArray(explanation)) {
        return '<p class="no-explanation">暫無解析說明</p>';
    }
    
    return explanation.map(text => {
        if (!text) return '';
        
        // 處理 \r\n 換行符
        let formattedText = text.replace(/\\r\\n/g, '<br>').replace(/\r\n/g, '<br>');
        
        // 處理 Markdown 式的格式
        formattedText = formattedText
            .replace(/✅/g, '<span class="correct-mark">✅</span>')
            .replace(/❌/g, '<span class="incorrect-mark">❌</span>')
            .replace(/🧠/g, '<span class="brain-mark">🧠</span>')
            .replace(/📘/g, '<span class="book-mark">📘</span>')
            .replace(/🔍/g, '<span class="search-mark">🔍</span>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // 粗體
            .replace(/\*(.*?)\*/g, '<em>$1</em>'); // 斜體
        
        return `<p class="explanation-paragraph">${formattedText}</p>`;
    }).join('');
}

/**
 * 切換解析顯示狀態
 */
function toggleExplanations() {
    const explanationSections = document.querySelectorAll('.explanation-section');
    const isCurrentlyVisible = explanationSections.length > 0 && 
        explanationSections[0].style.display !== 'none';
    
    explanationSections.forEach(section => {
        section.style.display = isCurrentlyVisible ? 'none' : 'block';
    });
    
    // 更新按鈕文字
    updateExplanationButtonText(!isCurrentlyVisible);
}

/**
 * 更新解析按鈕文字
 */
function updateExplanationButtonText(isVisible) {
    const buttons = document.querySelectorAll('.toggle-explanation-btn');
    buttons.forEach(button => {
        button.textContent = isVisible ? '隱藏解析' : '顯示解析';
        button.classList.toggle('active', isVisible);
    });
}

/**
 * 複習模式相關函數
 */
function showReviewMode() {
    if (!hasQuestionBank()) {
        showAlert('請先匯入題目！');
        return;
    }

    const container = document.getElementById('review-question-list');
    container.innerHTML = '';

    examState.questionBank.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';
        questionDiv.innerHTML = createReviewQuestionHTML(question, index);
        container.appendChild(questionDiv);
    });

    showScreen('review-screen');
    
    // 確保按鈕文字正確
    updateExplanationButtonText(false);
}

function hasQuestionBank() {
    return examState.questionBank && examState.questionBank.length > 0;
}

function createReviewQuestionHTML(question, index) {
    return `
        <div class="question-number">第 ${index + 1} 題</div>
        <div class="question">${question.Question}</div>
        <div class="options">
            ${createReviewOptionsHTML(question)}
        </div>
        <div class="answer-text">
            正確答案：${formatAnswerText(question)}
        </div>
        <div class="explanation-section" style="display: none;">
            <div class="explanation-header">📚 詳細解析</div>
            <div class="explanation-content">${formatExplanationText(question.Explanation)}</div>
        </div>
    `;
}

function createReviewOptionsHTML(question) {
    return question.OptionKeys.map(key => `
        <div class="option ${question.Answer.includes(key) ? 'correct' : ''}">
            <span class="option-label">${key}.</span>
            ${question.Options[key]}
        </div>
    `).join('');
}

/**
 * 工具函數
 */
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.querySelector(`.${screenName}`).classList.add('active');
}

function showAlert(message) {
    alert(message);
}

function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

function generateRandomSequence(totalQuestions, count) {
    // 檢查參數有效性
    if (totalQuestions < count) {
        throw new Error(`題庫題數(${totalQuestions})小於要求題數(${count})`);
    }

    // 創建初始序列
    const sequence = Array.from(
        { length: totalQuestions }, 
        (_, index) => index
    );

    // 隨機打亂
    for (let i = sequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }

    // 返回指定數量的題目
    return sequence.slice(0, count);
}

/**
 * 取消考試相關函數
 */
function cancelExam() {
    if (confirm('確定要取消測驗嗎？')) {
        stopTimer();
        navigateToHome();
    }
}

function restartExam() {
    showExamMode();
}

/**
 * 事件監聽器設置
 */
window.onload = function() {
    // 初始化檔案輸入
    resetFileInput();
    
    // 設置題數輸入的事件監聽 (keypress event => unused)
    // setupQuestionCountInput();
    
    // 設置離開提醒
    setupBeforeUnload();
};

function resetFileInput() {
    const fileInput = document.getElementById('question-file-input');
    fileInput.value = '';
}

function setupQuestionCountInput() {
    const input = document.getElementById('question-count-input');
    
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            confirmQuestionCount();
        }
    });

    input.addEventListener('input', function(e) {
        const value = parseInt(e.target.value);
        if (value > QUESTION_RANGE.MAX) e.target.value = QUESTION_RANGE.MAX;
        if (value < QUESTION_RANGE.MIN) e.target.value = QUESTION_RANGE.MIN;
    });
}

function setupBeforeUnload() {
    window.addEventListener('beforeunload', function(e) {
        if (timerState.examTimer) {
            const message = '考試正在進行中，確定要離開嗎？';
            e.returnValue = message;
            return message;
        }
    });
}

/**
 * 記憶體管理和清理
 */
function cleanupExam() {
    // 清理快取
    questionCache.clear();
    
    // 清理考試狀態
    examState.currentQuestions = 0;
    examState.wrongQuestions = null;
    examState.questionSequence = null;
    examState.userAnswers.clear();
    examState.markedQuestions.clear();
    
    // 強制垃圾回收
    if (window.gc) {
        window.gc();
    }
}

// 在適當的時機呼叫清理函數
function navigateToHome() {
    cleanupExam();
    showScreen('home-screen');
}

// 新增定期清理機制
setInterval(() => {
    if (!timerState.examTimer) {
        cleanupExam();
    }
}, 300000); // 每5分鐘清理一次未使用的資源


/** =====  Feature  ===== **/
/**
 * 檢查答案是否存在
 */
function hasAnswer(questionId) {
    try {
        const answer = examState.userAnswers.get(questionId);
        return answer && answer.length > 0;
    } catch (error) {
        console.error('檢查答案時發生錯誤:', error);
        return false;
    }
}
/**
 * 統計答題狀況
 */
function getAnswerStats() {
    try {
        let answeredCount = 0;
        let unansweredCount = 0;

        for (let i = 0; i < examState.questionCount; i++) {
            const questionIndex = examState.questionSequence[i];
            const question = examState.questionBank[questionIndex];
            
            if (hasAnswer(question.id)) {
                answeredCount++;
            } else {
                unansweredCount++;
            }
        }

        return {
            answered: answeredCount,
            unanswered: unansweredCount,
            total: examState.questionCount
        };

    } catch (error) {
        console.error('統計答題狀況時發生錯誤:', error);
        return { answered: 0, unanswered: 0, total: 0 };
    }
}