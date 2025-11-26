const path = require('path');
const { readFileSync } = require('fs');
const { Script } = require('vm');

const test = require('ava');
const { JSDOM, VirtualConsole } = require('jsdom');

const virtualConsole = new VirtualConsole();
// virtualConsole.sendTo(console); // Uncomment to see console logs from the virtual DOM

// Read the built library
const scriptContent = readFileSync(path.join(__dirname, '..', 'dist', 'lazyframe.min.js'));
const script = new Script(scriptContent);

// Global to capture the observer callback
let observerCallback = null;

test.beforeEach(t => {
  observerCallback = null;

  const dom = new JSDOM(``, {
    includeNodeLocations: true,
    resources: 'usable',
    runScripts: 'dangerously',
    virtualConsole,
    url: "http://localhost/"
  });

  // Mock IntersectionObserver to test the new Map-based lookup
  dom.window.IntersectionObserver = class IntersectionObserver {
    constructor(cb) {
      observerCallback = cb;
    }
    observe(el) {}
    unobserve(el) {}
    disconnect() {}
  };

  // Mock fetch for the new modern API requests
  dom.window.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        title: 'Mock API Title',
        thumbnail_url: 'https://via.placeholder.com/150'
      })
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
      observerCallback([{
        target: node,
        isIntersecting: true
      }]);
    }
  };
})

test.afterEach(() => {
  document.body.innerHTML = '';
});

const createDomNode = (params = {}) => {
  const node = document.createElement('div');
  node.classList.add('lazyframe');
  for (const [ key, value ] of Object.entries(params)) {
    node.setAttribute(`data-${key}`, value)
  }
  document.body.appendChild(node);
  return node;
}

test('should expose lazyframe()', (t) => {
  t.true(typeof window.lazyframe === 'function');
});

test('should initialize one node with a string selector (Observer)', (t) => {
  const node = createDomNode({ vendor: 'youtube', src: 'http://www.youtube.com/embed/iwGFalTRHDA/?rel=0' });
  window.lazyframe('.lazyframe');
  
  // Should not be loaded yet (waiting for intersection)
  t.is(document.querySelectorAll('.lazyframe--loaded').length, 0);

  // Simulate intersection
  global.triggerIntersection(node);

  // Now it should be loaded
  t.is(document.querySelectorAll('.lazyframe--loaded').length, 1);
})

test('should initialize multiple nodes with a string selector', (t) => {
  const node1 = createDomNode({ vendor: 'youtube', src: 'http://www.youtube.com/embed/iwGFalTRHDA' });
  const node2 = createDomNode({ vendor: 'youtube', src: 'http://www.youtube.com/embed/iwGFalTRHDB' });

  window.lazyframe('.lazyframe');
  
  global.triggerIntersection(node1);
  global.triggerIntersection(node2);

  t.is(document.querySelectorAll('.lazyframe--loaded').length, 2);
})

test('should append an iframe on click', (t) => {
  const node = createDomNode({ vendor: 'youtube', src: 'http://www.youtube.com/embed/iwGFalTRHDA/?rel=0' });

  window.lazyframe('.lazyframe');
  global.triggerIntersection(node);

  node.click();
  t.truthy(node.querySelector('iframe'));
})

test('should call onAppend callback function', (t) => {
  let count = 0;
  const node = createDomNode({ vendor: 'youtube', src: 'http://www.youtube.com/embed/iwGFalTRHDA' });

  window.lazyframe('.lazyframe', {
    onAppend: () => count++
  });
  global.triggerIntersection(node);

  node.click();
  t.is(count, 1);
})

test('should correctly parse boolean attributes (autoplay=false)', (t) => {
  const node = createDomNode({ 
      vendor: 'youtube', 
      src: 'http://www.youtube.com/embed/iwGFalTRHDA', 
      autoplay: 'false' 
  });
  
  window.lazyframe(node);
  global.triggerIntersection(node);
  node.click();

  const iframe = node.querySelector('iframe');
  // src logic: ...autoplay=${s.autoplay ? "1" : "0"}...
  t.regex(iframe.src, /autoplay=0/);
})

test('should correctly parse boolean attributes (autoplay=true)', (t) => {
  const node = createDomNode({ 
      vendor: 'youtube', 
      src: 'http://www.youtube.com/embed/iwGFalTRHDA', 
      autoplay: 'true' 
  });
  
  window.lazyframe(node);
  global.triggerIntersection(node);
  node.click();

  const iframe = node.querySelector('iframe');
  t.regex(iframe.src, /autoplay=1/);
})

test('should fetch title from API when missing', async (t) => {
  const node = createDomNode({ vendor: 'youtube', src: 'http://www.youtube.com/embed/iwGFalTRHDA' });
  
  window.lazyframe(node);
  global.triggerIntersection(node);

  // Allow async fetch to complete
  await new Promise(r => setTimeout(r, 20));

  const title = node.querySelector('.lazyframe__title');
  t.truthy(title);
  t.is(title.textContent, 'Mock API Title');
})

test('should NOT fetch API if title and thumbnail are present', async (t) => {
  let fetchCalled = false;
  window.fetch = async () => { fetchCalled = true; return { ok: true }; };

  const node = createDomNode({ 
      vendor: 'youtube', 
      src: 'http://www.youtube.com/embed/iwGFalTRHDA',
      title: 'Custom Title',
      thumbnail: 'custom.jpg'
  });
  
  window.lazyframe(node);
  global.triggerIntersection(node);

  await new Promise(r => setTimeout(r, 20));

  t.false(fetchCalled);
  t.is(node.querySelector('.lazyframe__title').textContent, 'Custom Title');
})

test('should support Vimeo provider', (t) => {
  const node = createDomNode({ vendor: 'vimeo', src: 'https://vimeo.com/123456' });
  
  window.lazyframe(node);
  global.triggerIntersection(node);
  node.click();

  const iframe = node.querySelector('iframe');
  t.regex(iframe.src, /player\.vimeo\.com\/video\/123456/);
})
