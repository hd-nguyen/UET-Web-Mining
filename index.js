const puppeteer = require('puppeteer');
const fs = require('fs');

const userAgentsList = [
    'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.83 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36'
];

function getRandomUserAgent() {
    return userAgentsList[Math.floor(Math.random() * userAgentsList.length)];
}

const STATE_FILE = 'crawler_state.json';

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(STATE_FILE));
            return state.current_page || 1;
        }
    } catch (error) {
        console.error('Error loading state:', error);
    }
    return 1;
}

function saveState(currentPage) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ current_page: currentPage }));
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

(async () => {
    const out = [];
    let currentPage = loadState();
    console.log(`Starting from page ${currentPage}`);

    for (let i = currentPage; i <= 243; i++) {
        // Create data directory if it doesn't exist
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
        }

        // Skip if page already scraped
        const pageFile = `data/Scrapped_Page_${i}.json`;
        if (fs.existsSync(pageFile)) {
            console.log(`Page ${i} already processed, skipping...`);
            currentPage = i + 1;
            saveState(currentPage);
            continue;
        }

        // Launch browser with visible UI
        const browser = await puppeteer.launch({
            headless: "new",
            defaultViewport: null,
            args: ['--start-maximized', '--disable-web-security'],
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        });

        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(120000);

        try {
            const url = `https://www.glassdoor.com/Interview/NVIDIA-Interview-Questions-E7633_P${i}.htm`;
            await page.setUserAgent(getRandomUserAgent());
            await page.goto(url, { waitUntil: 'networkidle0' });

            const reviews = await page.evaluate(() => {
                const reviewElements = document.querySelectorAll('div[data-brandviews*="MODULE:n=interview-reviews"]');
                const reviewData = [];
                reviewElements.forEach(review => {
                    const details = {
                        text: null,
                        date: null,
                        attribute: null
                    };
                    try {
                        details.date = review.querySelector('span[class*="timestamp_reviewDate"]')?.innerText || null;
                        
                        // Get application text
                        const textApplication = review.querySelector('div[data-test*="ApplicationDetails"] p[class*="interview-details_textStyle"]')?.innerText || null;
                        
                        // Get interview process text - Updated selector to match the correct element
                        const textInterview = review.querySelector('div[data-test*="Process"] p[class*="truncated-text"]')?.innerText || null;
                        
                        // Get interview question text
                        const textQuestion = review.querySelector('div[data-test="interview-question-container"] div[class*="interview-details_interviewText"] p[class*="truncated-text"]')?.innerText || null;
                        
                        details.text = [textApplication, textInterview, textQuestion];
                    } catch (e) {
                        console.error('Error extracting text values:', e);
                    }
                    try {
                        // Get attributes (offer status, experience, difficulty)
                        const experienceContainer = review.querySelector('div[class*="interview-details_experienceContainer"]');
                        const spanTags = experienceContainer?.querySelectorAll('div[class*="rating-icon_ratingContainer"] span:not([class*="__hov"])');
                        const attributes = Array.from(spanTags || []).map(tag => tag.innerText);
                        details.attribute = attributes;
                    } catch (e) {
                        console.error('Error extracting attribute values:', e);
                    }
                    reviewData.push(details);
                });
                return reviewData;
            });

            out.push(...reviews);
            console.log(`Page ${i} processed`);

            fs.writeFileSync(pageFile, JSON.stringify(reviews, null, 2));
            console.log(`Data saved to ${pageFile}`);

            // Update and save state
            currentPage = i + 1;
            saveState(currentPage);

        } catch (error) {
            console.error(`Error processing page ${i}:`, error);
            // Save state even if error occurs
            saveState(i);
            break;
        } finally {
            await browser.close();
        }

        // Random delay between requests
        const delay = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Combine all files at the end
    try {
        const allData = [];
        for (let i = 1; i <= currentPage - 1; i++) {
            const pageFile = `data/Scrapped_Page_${i}.json`;
            if (fs.existsSync(pageFile)) {
                const pageData = JSON.parse(fs.readFileSync(pageFile));
                allData.push(...pageData);
            }
        }
        fs.writeFileSync('data/Scrapped_1_243.json', JSON.stringify(allData, null, 2));
        console.log('All data combined and saved to Scrapped_1_243.json');
    } catch (error) {
        console.error('Error combining files:', error);
    }
})();