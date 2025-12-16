const path = require('path');
const { readFileSync } = require('fs');
const test = require('ava');
const { JSDOM, VirtualConsole } = require('jsdom');

const virtualConsole = new VirtualConsole();
// virtualConsole.forwardTo(console);

// Read the built library
const scriptContent = readFileSync(path.join(__dirname, '../dist/lazyframe.min.js'));

// Global to capture the observer callback
let observerCallback = null;

test.beforeEach(() => {
    observerCallback = null;

    const dom = new JSDOM(``, {
        includeNodeLocations: true,
        resources: 'usable',
        runScripts: 'dangerously',
        virtualConsole,
        url: 'http://localhost/',
    });

    // Mock IntersectionObserver to test the new Map-based lookup
    dom.window.IntersectionObserver = class IntersectionObserver {
        constructor(cb) {
            observerCallback = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
    };

    // Mock fetch for the new modern API requests
    dom.window.fetch = async (url) => {
        // Simulate different responses based on URL
        if (url.includes('youtube')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    title: 'YouTube Video Title',
                    thumbnail_url: 'https://i.ytimg.com/vi/iwGFalTRHDA/maxresdefault.jpg',
                }),
            };
        } else if (url.includes('vimeo')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    title: 'Vimeo Video Title',
                    thumbnail_url: 'https://i.vimeocdn.com/video/123456_640.jpg',
                }),
            };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                title: 'Generic Title',
                thumbnail_url: 'https://via.placeholder.com/640x360',
            }),
        };
    };

    dom.window.eval(scriptContent.toString());
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.NodeList = dom.window.NodeList;

    // Helper to simulate an element entering the viewport
    global.triggerIntersection = (node) => {
        if (observerCallback) {
            observerCallback([
                {
                    target: node,
                    isIntersecting: true,
                },
            ]);
        }
    };
});

test.afterEach(() => {
    document.body.innerHTML = '';
});

const createDomNode = (params = {}) => {
    const node = document.createElement('div');
    node.classList.add('lazyframe');
    for (const [key, value] of Object.entries(params)) {
        node.dataset[key] = value;
    }
    document.body.appendChild(node);
    return node;
};

// ===== BASIC FUNCTIONALITY TESTS =====

test('should expose lazyframe()', (t) => {
    t.true(typeof window.lazyframe === 'function');
});

test('should initialize one node with a string selector', (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA/?rel=0',
    });
    window.lazyframe('.lazyframe');

    t.is(document.querySelectorAll('.lazyframe--loaded').length, 1);
});

test('should initialize multiple nodes with a string selector', (t) => {
    createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
    });
    createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDB',
    });

    window.lazyframe('.lazyframe');

    t.is(document.querySelectorAll('.lazyframe--loaded').length, 2);
});

test('should initialize with a single HTMLElement', (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
    });
    window.lazyframe(node);

    t.is(document.querySelectorAll('.lazyframe--loaded').length, 1);
});

test('should initialize with a NodeList', (t) => {
    createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
    });
    createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDB',
    });

    const nodes = document.querySelectorAll('.lazyframe');
    window.lazyframe(nodes);

    t.is(document.querySelectorAll('.lazyframe--loaded').length, 2);
});

test('should throw error when data-src is missing', (t) => {
    const node = document.createElement('div');
    node.classList.add('lazyframe');
    document.body.appendChild(node);

    t.throws(
        () => {
            window.lazyframe(node);
        },
        { message: /data-src.*must exist/i },
    );
});

// ===== LAZY LOADING TESTS =====

test('should lazy load by default (wait for intersection)', (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
    });
    window.lazyframe('.lazyframe');

    t.false(node.classList.contains('lazyframe--ready'));

    global.triggerIntersection(node);

    t.true(node.classList.contains('lazyframe--loaded'));
});

test('should load immediately when lazyload is false (global option)', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test Title',
        thumbnail: 'test.jpg',
    });

    window.lazyframe('.lazyframe', { lazyload: false });

    // Wait for async operations
    await new Promise((r) => setTimeout(r, 20));

    t.true(node.classList.contains('lazyframe--ready'));
});

test('should load immediately when data-lazyload is false', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        lazyload: 'false',
        title: 'Test Title',
        thumbnail: 'test.jpg',
    });

    window.lazyframe('.lazyframe');

    await new Promise((r) => setTimeout(r, 20));

    t.true(node.classList.contains('lazyframe--ready'));
});

// ===== IFRAME TESTS =====

test('should append an iframe on click', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA/?rel=0',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe('.lazyframe');
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();
    t.truthy(node.querySelector('iframe'));
});

test('iframe should have correct src attribute', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.truthy(iframe);
    t.regex(iframe.src, /youtube\.com\/embed\/iwGFalTRHDA/);
});

test('iframe should have allowFullscreen attribute', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.true(iframe.allowFullscreen);
});

test('iframe should have allow attribute when autoplay is true', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        autoplay: 'true',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.truthy(iframe.allow);
    t.regex(iframe.allow, /autoplay/);
});

test('should add lazyframe--activated class after click', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    t.true(node.classList.contains('lazyframe--activated'));
});

// ===== AUTOPLAY TESTS =====

test('should have autoplay=1 in src when autoplay is true (global)', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node, { autoplay: true });
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.regex(iframe.src, /autoplay=1/);
});

test('should have autoplay=0 in src when autoplay is false (data attribute)', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        autoplay: 'false',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.regex(iframe.src, /autoplay=0/);
});

test('should have autoplay=1 when data-autoplay=true', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        autoplay: 'true',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.regex(iframe.src, /autoplay=1/);
});

// ===== INITINVIEW TESTS =====

test('should auto-click when initinview is true (global)', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node, { initinview: true });

    t.false(node.classList.contains('lazyframe--activated'));

    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    t.true(node.classList.contains('lazyframe--activated'));
    t.truthy(node.querySelector('iframe'));
});

test('should auto-click when data-initinview=true', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        initinview: 'true',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    t.true(node.classList.contains('lazyframe--activated'));
});

// ===== API TESTS =====

test('should fetch title from API when missing', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 50));

    const title = node.querySelector('.lazyframe__title');
    t.truthy(title);
    t.is(title.textContent, 'YouTube Video Title');
});

test('should fetch thumbnail from API when missing', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Custom Title',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 50));

    t.truthy(node.style.backgroundImage);
    t.regex(node.style.backgroundImage, /ytimg\.com/);
});

test('should NOT fetch API if title and thumbnail are present', async (t) => {
    let fetchCalled = false;
    window.fetch = async () => {
        fetchCalled = true;
        return { ok: true };
    };

    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Custom Title',
        thumbnail: 'custom.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 50));

    t.false(fetchCalled);
    t.is(node.querySelector('.lazyframe__title').textContent, 'Custom Title');
});

test('should NOT fetch API when data-load-thumbnail is false', async (t) => {
    let fetchCalled = false;
    window.fetch = async () => {
        fetchCalled = true;
        return { ok: true };
    };

    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Custom Title',
        loadThumbnail: 'false',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 50));

    t.false(fetchCalled);
});

// ===== VENDOR TESTS =====

test('should support YouTube provider', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'https://www.youtube.com/watch?v=iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.regex(iframe.src, /youtube\.com\/embed\/iwGFalTRHDA/);
});

test('should support YouTube no-cookie provider', async (t) => {
    const node = createDomNode({
        vendor: 'youtube_nocookie',
        src: 'https://www.youtube-nocookie.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.regex(iframe.src, /youtube-nocookie\.com\/embed\/iwGFalTRHDA/);
    t.is(node.getAttribute('data-vendor'), 'youtube_nocookie');
});

test('should support Vimeo provider', async (t) => {
    const node = createDomNode({
        vendor: 'vimeo',
        src: 'https://vimeo.com/123456',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.regex(iframe.src, /player\.vimeo\.com\/video\/123456/);
});

test('should extract video ID from YouTube URL', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.regex(iframe.src, /dQw4w9WgXcQ/);
});

test('should extract video ID from Vimeo URL', async (t) => {
    const node = createDomNode({
        vendor: 'vimeo',
        src: 'https://vimeo.com/987654321',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.regex(iframe.src, /987654321/);
});

// ===== QUERY PARAMETER TESTS =====

test('should preserve existing query parameters', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'https://www.youtube.com/watch?v=iwGFalTRHDA&rel=0&modestbranding=1',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    const iframe = node.querySelector('iframe');
    t.regex(iframe.src, /rel=0/);
    t.regex(iframe.src, /modestbranding=1/);
});

// ===== THUMBNAIL TESTS =====

test('should apply thumbnail as background image', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        thumbnail: 'https://example.com/thumb.jpg',
        title: 'Test',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    t.truthy(node.style.backgroundImage);
    t.regex(node.style.backgroundImage, /example\.com\/thumb\.jpg/);
});

// TODO: Re-enable when migrating to Vitest + happy-dom
// JSDOM doesn't properly support -webkit-image-set() CSS values, causing
// node.style.backgroundImage to return an empty string even though the value
// is being set correctly in the source code. happy-dom has better CSS support
// and should handle this properly. For now, the functionality works correctly
// in real browsers - this is purely a test environment limitation.
test.skip('should support multiple thumbnail URLs (image-set)', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        thumbnail: 'thumb1.jpg, thumb2.jpg',
        title: 'Test',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    t.truthy(node.style.backgroundImage);
    t.regex(node.style.backgroundImage, /image-set/);
});

test('should NOT apply thumbnail when loadThumbnail is false (global)', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        thumbnail: 'https://example.com/thumb.jpg',
        title: 'Test',
    });

    window.lazyframe(node, { loadThumbnail: false });
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    t.is(node.style.backgroundImage, '');
});

test('should NOT apply thumbnail when data-load-thumbnail is false', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        thumbnail: 'https://example.com/thumb.jpg',
        title: 'Test',
        loadThumbnail: 'false',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    t.is(node.style.backgroundImage, '');
});

// ===== TITLE TESTS =====

test('should display custom title', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'My Custom Title',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    const title = node.querySelector('.lazyframe__title');
    t.truthy(title);
    t.is(title.textContent, 'My Custom Title');
});

test('should not duplicate title element', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test Title',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    const titles = node.querySelectorAll('.lazyframe__title');
    t.is(titles.length, 1);
});

// ===== PLAY BUTTON TESTS =====

test('should show play button by default', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    const playBtn = node.querySelector('.lf-play-btn');
    t.truthy(playBtn);
});

test('should NOT show play button when showPlayButton is false (global)', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node, { showPlayButton: false });
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    const playBtn = node.querySelector('.lf-play-btn');
    t.falsy(playBtn);
});

test('should NOT show play button when data-show-play-button is false', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        showPlayButton: 'false',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    const playBtn = node.querySelector('.lf-play-btn');
    t.falsy(playBtn);
});

// ===== ASPECT RATIO TESTS =====

test('should apply 16:9 aspect ratio', (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        ratio: '16:9',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);

    t.is(node.getAttribute('data-ratio'), '16:9');
});

test('should apply 4:3 aspect ratio', (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        ratio: '4:3',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);

    t.is(node.getAttribute('data-ratio'), '4:3');
});

test('should apply 1:1 aspect ratio', (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        ratio: '1:1',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);

    t.is(node.getAttribute('data-ratio'), '1:1');
});

// ===== CALLBACK TESTS =====

test('should call onLoad callback', async (t) => {
    let called = false;
    let instance = null;

    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe('.lazyframe', {
        onLoad: (inst) => {
            called = true;
            instance = inst;
        },
    });

    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    t.true(called);
    t.truthy(instance);
    t.truthy(instance.el);
    t.truthy(instance.settings);
});

test('should call onAppend callback', async (t) => {
    let count = 0;
    let appendedIframe = null;

    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe('.lazyframe', {
        onAppend: (iframe) => {
            count++;
            appendedIframe = iframe;
        },
    });

    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    node.click();

    t.is(count, 1);
    t.truthy(appendedIframe);
    t.is(appendedIframe.tagName, 'IFRAME');
});

test('should call onThumbnailLoad callback when thumbnail is fetched', async (t) => {
    let called = false;
    let thumbnailUrl = null;

    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
    });

    window.lazyframe(node, {
        onThumbnailLoad: (url) => {
            called = true;
            thumbnailUrl = url;
        },
    });

    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 50));

    t.true(called);
    t.truthy(thumbnailUrl);
    t.regex(thumbnailUrl, /ytimg\.com/);
});

// ===== ERROR HANDLING TESTS =====

test('should handle API errors gracefully', async (t) => {
    window.fetch = async () => {
        throw new Error('Network error');
    };

    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 50));

    // Should still build the frame
    t.true(node.classList.contains('lazyframe--ready'));
});

test('should handle failed API response', async (t) => {
    window.fetch = async () => ({
        ok: false,
        status: 404,
    });

    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 50));

    t.true(node.classList.contains('lazyframe--ready'));
});

// ===== CSS CLASS TESTS =====

test('should add lazyframe--loaded class', (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);

    t.true(node.classList.contains('lazyframe--loaded'));
});

test('should add lazyframe--ready class after initialization', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    t.true(node.classList.contains('lazyframe--ready'));
});

test('should not initialize the same element twice', async (t) => {
    const node = createDomNode({
        vendor: 'youtube',
        src: 'http://www.youtube.com/embed/iwGFalTRHDA',
        title: 'Test',
        thumbnail: 'test.jpg',
    });

    window.lazyframe(node);
    window.lazyframe(node); // Call twice

    global.triggerIntersection(node);

    await new Promise((r) => setTimeout(r, 20));

    const titles = node.querySelectorAll('.lazyframe__title');
    t.is(titles.length, 1); // Should only have one title
});
