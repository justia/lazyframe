const providers = {
    youtube: {
        regex: /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : undefined),
        buildSrc: (s) => `https://www.youtube.com/embed/${s.id}/?autoplay=${s.autoplay ? '1' : '0'}&${s.query || ''}`,
    },
    youtube_nocookie: {
        regex: /(?:youtube-nocookie\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=)))([a-zA-Z0-9_-]{6,11})/,
        condition: (m) => (m && m[1].length === 11 ? m[1] : undefined),
        buildSrc: (s) => `https://www.youtube-nocookie.com/embed/${s.id}/?autoplay=${s.autoplay ? '1' : '0'}&${s.query || ''}`,
    },
    vimeo: {
        regex: /vimeo\.com\/(?:video\/)?([0-9]*)(?:\?|)/,
        condition: (m) => (m && m[1].length > 0 ? m[1] : undefined),
        buildSrc: (s) => `https://player.vimeo.com/video/${s.id}/?autoplay=${s.autoplay ? '1' : '0'}&${s.query || ''}`,
    },
};
// --- Library Code ---
const Lazyframe = () => {
    let programmaticOptions;
    const elements = new Map();
    const DEFAULT_OPTIONS = {
        lazyload: true,
        autoplay: true,
        loadThumbnail: true,
        initinview: false,
        showPlayButton: true,
        onLoad: () => { },
        onAppend: () => { },
        onThumbnailLoad: () => { },
    };
    const constants = {
        endpoint: (s) => {
            if (s.vendor?.includes('youtube')) {
                return `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${s.id}`;
            }
            return `https://noembed.com/embed?url=${s.src}`;
        },
        response: {
            title: (r) => r.title,
            thumbnail: (r) => r.thumbnail_url,
        },
    };
    function init(selector, userOptions = {}) {
        programmaticOptions = { ...DEFAULT_OPTIONS, ...userOptions };
        const els = typeof selector === 'string' ? document.querySelectorAll(selector) : selector;
        if (els instanceof HTMLElement) {
            loop(els);
        }
        else {
            els.forEach(loop);
        }
        // TODO:
        // Observers are currently initialized regardless of the value set with the `data-lazyload` attribute.
        // Right now, the only way to configure this behavior is by passing a `lazyload` option when calling
        // the `lazyframe` function:
        //
        // ```
        // lazyframe('.selector', { lazyload: false });
        // ```
        //
        // If all elements found during initialization have `data-lazyload="false"`, the observer is still created,
        // but it should not be.
        //
        // A better approach would be to use a global flag like `enableLazyloadObserver`, initialized to `false`.
        // During initialization, if any element has `data-lazyload="true"`, the flag would be set to `true`.
        //
        // This ensures the observer is only created when at least one element actually requires lazy loading.
        //
        if (programmaticOptions.lazyload) {
            setObservers();
        }
    }
    function loop(el) {
        if (!(el instanceof HTMLElement) || el.classList.contains('lazyframe--loaded'))
            return;
        // There's cases where the `lazyload` library is loaded in two
        // different scripts, so we set a flag to know if an iframe
        // was already handled by lazyload previously
        if (el.dataset.lazyloadReady === 'true')
            return;
        const instance = {
            el,
            settings: setup(el),
        };
        instance.el.addEventListener('click', () => {
            if (instance.iframe) {
                instance.el.appendChild(instance.iframe);
            }
            instance.el.classList.add('lazyframe--activated');
            const iframe = el.querySelector('iframe');
            if (iframe && instance.settings.onAppend) {
                instance.settings.onAppend(iframe);
            }
        });
        if (instance.settings.lazyload) {
            build(instance);
        }
        else {
            api(instance);
        }
        // Assign this at the end to avoid polution during the setup.
        el.dataset.lazyloadReady = 'true';
    }
    function setup(el) {
        const { 
        // Extract known Boolean keys
        lazyload, autoplay, initinview, loadThumbnail, showPlayButton, 
        // Extract other useful variables
        src, vendor: dataVendor, 
        // Capture the rest (vendor, title, thumbnail, ratio, etc.)
        ...restDataAttrs } = el.dataset;
        // Safety check for src
        if (!src) {
            throw new Error(`Lazyframe: The 'data-src' attribute must exist. Please make sure it is defined: ${el}`);
        }
        let vendor = dataVendor;
        let id;
        if (src.includes('youtube-nocookie')) {
            vendor = 'youtube_nocookie';
        }
        if (vendor) {
            const provider = providers[vendor];
            const match = src.match(provider.regex);
            id = provider.condition(match);
        }
        // Merge defaults, user settings, and data attributes in order of precedence
        const options = {
            // First spread programmating options. Specifically `onLoad`, `onAppend` and `onThumbnailLoad`.
            ...programmaticOptions,
            // Spread the remaining data attributes defined on each element.
            ...restDataAttrs,
            // Set props that could only be obtained through `data-*` attributes.
            src,
            vendor,
            id,
            // Set extra info.
            initialized: false, // Always start as not initialized
            originalSrc: src,
            query: getQuery(src),
            // Parse booleans with defaults and override programmatic options if `data-*` attributes were defined.
            lazyload: parseBoolean(lazyload, programmaticOptions.lazyload),
            autoplay: parseBoolean(autoplay, programmaticOptions.autoplay),
            initinview: parseBoolean(initinview, programmaticOptions.initinview),
            loadThumbnail: parseBoolean(loadThumbnail, programmaticOptions.loadThumbnail),
            showPlayButton: parseBoolean(showPlayButton, programmaticOptions.showPlayButton),
        };
        return options;
    }
    function getQuery(src) {
        const query = src.split('?');
        return query[1] ? query[1] : undefined;
    }
    function useApi(settings) {
        if (!settings.vendor)
            return false;
        return !settings.title || !settings.thumbnail;
    }
    function parseBoolean(value, defaultValue = false) {
        if (value === undefined || value === null)
            return defaultValue;
        return value === 'true';
    }
    async function api(instance) {
        if (!useApi(instance.settings)) {
            build(instance, true);
            return;
        }
        const endpoint = constants.endpoint(instance.settings);
        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            const data = await response.json();
            if (!instance.settings.title) {
                instance.settings.title = data.title;
            }
            if (!instance.settings.thumbnail) {
                const url = data.thumbnail_url;
                instance.settings.thumbnail = url;
                if (instance.settings.onThumbnailLoad) {
                    instance.settings.onThumbnailLoad(url);
                }
            }
            build(instance, true);
        }
        catch (error) {
            console.error('Lazyframe API call failed:', error);
            // Build the frame anyway so the user experience isn't broken
            build(instance, true);
        }
    }
    function setPlayBtn(btnTxt = 'Play') {
        const playButton = document.createElement('button');
        playButton.type = 'button';
        playButton.classList.add('lf-play-btn');
        playButton.innerHTML = `<span class="visually-hidden">${btnTxt}</span>`;
        return playButton;
    }
    function setObservers() {
        const initElement = (instance) => {
            if (instance.settings.initialized)
                return;
            instance.settings.initialized = true;
            instance.el.classList.add('lazyframe--loaded');
            api(instance);
            if (instance.settings.initinview) {
                instance.el.click();
            }
            if (instance.settings.onLoad) {
                instance.settings.onLoad(instance);
            }
        };
        const lazyframeObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const instance = elements.get(entry.target);
                    if (instance) {
                        initElement(instance);
                        lazyframeObserver.unobserve(entry.target);
                        elements.delete(entry.target);
                    }
                }
            });
        });
        elements.forEach((instance) => {
            lazyframeObserver.observe(instance.el);
        });
    }
    function build(instance, loadImage) {
        instance.iframe = getIframe(instance.settings);
        if (instance.settings.thumbnail && loadImage && instance.settings.loadThumbnail) {
            const thumbnails = instance.settings.thumbnail.replace(/\s/g, '').split(',');
            if (thumbnails.length > 1) {
                const imageSet = `url('${thumbnails[0]}') 1x, url('${thumbnails[1]}') 1x`;
                instance.el.style.backgroundImage = `-webkit-image-set(${imageSet})`;
            }
            else {
                instance.el.style.backgroundImage = `url('${thumbnails[0]}')`;
            }
        }
        if (instance.settings.title && !instance.el.querySelector('.lazyframe__title')) {
            const titleNode = document.createElement('span');
            titleNode.className = 'lazyframe__title';
            titleNode.textContent = instance.settings.title;
            instance.el.appendChild(titleNode);
        }
        if (instance.settings.showPlayButton && !instance.el.querySelector('.lf-play-btn')) {
            instance.el.appendChild(setPlayBtn());
        }
        if (!instance.settings.lazyload) {
            instance.el.classList.add('lazyframe--loaded');
            if (instance.settings.onLoad) {
                instance.settings.onLoad(instance);
            }
        }
        if (!instance.settings.initialized) {
            elements.set(instance.el, instance);
        }
    }
    function getIframe(settings) {
        const iframeNode = document.createElement('iframe');
        if (settings.vendor && providers[settings.vendor]) {
            settings.src = providers[settings.vendor].buildSrc(settings);
        }
        if (settings.id)
            iframeNode.id = `lazyframe-${settings.id}`;
        iframeNode.src = settings.src;
        iframeNode.frameBorder = '0';
        iframeNode.allowFullscreen = true;
        if (settings.autoplay) {
            iframeNode.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        }
        return iframeNode;
    }
    return init;
};
const lazyframe = Lazyframe();

export { lazyframe as default };
