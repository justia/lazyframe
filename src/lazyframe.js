import './scss/lazyframe.scss?raw';

const Lazyframe = () => {
    let settings;
    const elements = [];
    const defaults = {
        vendor: undefined,
        id: undefined,
        src: undefined,
        thumbnail: undefined,
        title: undefined,
        initialized: false,
        lazyload: true,
        autoplay: true,
        initinview: false,
        onLoad: (l) => { },
        onAppend: (l) => { },
        onThumbnailLoad: (img) => { }
    };

    const constants = {
        regex: {
            youtube_nocookie: /(?:youtube-nocookie\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=)))([a-zA-Z0-9_-]{6,11})/,
            youtube: /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/,
            vimeo: /vimeo\.com\/(?:video\/)?([0-9]*)(?:\?|)/,
        },
        condition: {
            youtube: (m) => (m && m[1].length == 11 ? m[1] : false),
            youtube_nocookie: (m) => (m && m[1].length == 11 ? m[1] : false),
            vimeo: (m) =>
                (m && m[1].length === 9) || m[1].length === 8 ? m[1] : false,
        },
        src: {
            youtube: (s) =>
                `https://www.youtube.com/embed/${s.id}/?autoplay=${s.autoplay ? "1" : "0"
                }&${s.query}`,
            youtube_nocookie: (s) =>
                `https://www.youtube-nocookie.com/embed/${s.id}/?autoplay=${s.autoplay ? "1" : "0"
                }&${s.query}`,
            vimeo: (s) =>
                `https://player.vimeo.com/video/${s.id}/?autoplay=${s.autoplay ? "1" : "0"
                }&${s.query}`,
        },
        endpoint: (s) => `https://noembed.com/embed?url=${s.src}`,
        response: {
            title: (r) => r.title,
            thumbnail: (r) => r.thumbnail_url,
        },
    };

    function init(elements, ...args) {
        settings = Object.assign({}, defaults, args[0]);

        if (typeof elements === 'string') {
            const selector = document.querySelectorAll(elements);
            for (let i = 0; i < selector.length; i++) {
                loop(selector[i]);
            }
        } else if (typeof elements.length === 'undefined') {
            loop(elements);
        } else {
            for (let i = 0; i < elements.length; i++) {
                loop(elements[i]);
            }
        }

        if (settings.lazyload) {
            setObservers();
        }
    }

    function loop(el) {
        if (el instanceof HTMLElement === false || el.classList.contains('lazyframe--loaded')) return;

        const lazyframe = {
            el: el,
            settings: setup(el),
        };

        lazyframe.el.addEventListener('click', () => {
            lazyframe.el.appendChild(lazyframe.iframe);
            lazyframe.el.classList.add('lazyframe--activated');

            const iframe = el.querySelector('iframe');
            lazyframe.settings.onAppend.call(this, iframe);
        });

        if (settings.lazyload) {
            build(lazyframe);
        } else {
            api(lazyframe, !!lazyframe.settings.thumbnail);
        }
    }

    function setup(el) {
        const attr = Array.prototype.slice.apply(el.attributes)
            .filter(att => att.value !== '')
            .reduce((obj, curr) => {
                let name = curr.name.indexOf('data-') === 0 ? curr.name.split('data-')[1] : curr.name;
                obj[name] = curr.value;
                return obj;
            }, {});

        const options = Object.assign({},
            settings,
            attr,
            {
                originalSrc: attr.src,
                query: getQuery(attr.src)
            }
        );

        if (options.vendor) {
            const match = options.src.match(constants.regex[options.vendor]);
            options.id = constants.condition[options.vendor](match);
        }

        return options;
    }

    function getQuery(src) {
        const query = src.split('?');
        return query[1] ? query[1] : null
    }

    function useApi(settings) {
        if (!settings.vendor) return false;
        return !settings.title || !settings.thumbnail;
    }

    function api(lazyframe) {
        if (useApi(lazyframe.settings)) {
            send(lazyframe, (err, data) => {
                if (err) return;

                const response = data[0];
                const _l = data[1];

                if (!_l.settings.title) {
                    _l.settings.title = constants.response.title(response);
                }
                if (!_l.settings.thumbnail) {
                    const url = constants.response.thumbnail(response);
                    _l.settings.thumbnail = url;
                    lazyframe.settings.onThumbnailLoad.call(this, url);
                }
                build(_l, true);
            });
        } else {
            build(lazyframe, true);
        }
    }

    function send(lazyframe, cb) {
        const endpoint = constants.endpoint(lazyframe.settings);
        const request = new XMLHttpRequest();

        request.open('GET', endpoint, true);

        request.onload = function () {
            if (request.status >= 200 && request.status < 400) {
                const data = JSON.parse(request.responseText);
                cb(null, [data, lazyframe]);
            } else {
                cb(true);
            }
        };

        request.onerror = function () {
            cb(true);
        };

        request.send();
    }

    function setPlayBtn(btnTxt = 'Play') {
        const playButton = document.createElement('button');
        playButton.type = 'button';
        playButton.classList.add('lf-play-btn');
        playButton.innerHTML = `<span class="visually-hidden">${btnTxt}</span>`;

        return playButton;
    }

    function setObservers() {
        const initElement = (el) => {
            el.settings.initialized = true;
            el.el.classList.add('lazyframe--loaded');
            el.el.appendChild(setPlayBtn());
            api(el);

            if (el.settings.initinview) {
                el.el.click();
            }

            el.settings.onLoad.call(this, el);
        }

        if ('IntersectionObserver' in window) {
            const lazyframeObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const lazyframe = elements.find(element => element.el == entry.target);

                        initElement(lazyframe);

                        lazyframeObserver.unobserve(entry.target);
                    }
                });
            });

            elements.forEach((lazyframe) => {
                lazyframeObserver.observe(lazyframe.el);
            });
        } else {
            elements.forEach((lazyframe) => {
                initElement(lazyframe);
            });
        }
    }

    function build(lazyframe, loadImage) {
        lazyframe.iframe = getIframe(lazyframe.settings);

        if (lazyframe.settings.thumbnail && loadImage) {
            let imgURL = lazyframe.settings.thumbnail;
            let imgSetData = `url(${imgURL}) 1x`;
            imgURL = imgURL.replace(/\s/g, '').split(',');

            if (imgURL.length > 1) {
                imgSetData = `url(${imgURL[0]}) 1x, url(${imgURL[1]}) 1x`;
            }

            lazyframe.el.style.backgroundImage = `-webkit-image-set(${imgSetData})`;
        }

        if (lazyframe.settings.title && lazyframe.el.children.length === 0) {
            const docfrag = document.createDocumentFragment();
            const titleNode = document.createElement('span');

            titleNode.className = 'lazyframe__title';
            titleNode.innerHTML = lazyframe.settings.title;
            docfrag.appendChild(titleNode);

            lazyframe.el.appendChild(docfrag);
        }

        if (!settings.lazyload) {
            lazyframe.el.classList.add('lazyframe--loaded');
            lazyframe.settings.onLoad.call(this, lazyframe);
            elements.push(lazyframe);
        }

        if (!lazyframe.settings.initialized) {
            elements.push(lazyframe);
        }
    }

    function getIframe(settings) {
        const docfrag = document.createDocumentFragment();
        const iframeNode = document.createElement('iframe');

        if (settings.vendor) {
            settings.src = constants.src[settings.vendor](settings);
        }

        iframeNode.setAttribute('id', `lazyframe-${settings.id}`);
        iframeNode.setAttribute('src', settings.src);
        iframeNode.setAttribute('frameborder', 0);
        iframeNode.setAttribute('allowfullscreen', '');

        if (settings.autoplay) {
            iframeNode.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        }

        docfrag.appendChild(iframeNode);
        return docfrag;
    }
    return init;
}

const lf = Lazyframe();

export default lf;