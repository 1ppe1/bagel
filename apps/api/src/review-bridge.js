(() => {
  const currentScript = document.currentScript;
  const messageType = 'docsync:element-selected';
  const bridgeNonce = currentScript?.dataset.docsyncBridgeNonce || '';
  const revisionId = currentScript?.dataset.docsyncRevisionId || '';
  const ignoredTags = new Set(['HTML', 'HEAD', 'BODY', 'META', 'SCRIPT', 'STYLE', 'LINK', 'TITLE']);
  const selectableSelector = [
    'a',
    'button',
    'input',
    'textarea',
    'select',
    'label',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'li',
    'section',
    'article',
    'main',
    'header',
    'footer',
    'nav',
    'img',
    'span',
    'div'
  ].join(',');
  let selectedElement = null;
  let hoveredElement = null;

  if (!/^[a-f0-9]{32}$/u.test(bridgeNonce) || revisionId.length === 0) {
    return;
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim();
  }

  function limit(value, maxLength) {
    const text = normalizeText(value);
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
  }

  function hashValue(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/gu, '\\$&');
  }

  function attributeSelector(name, value) {
    return `[${name}="${String(value).replace(/"/gu, '\\"')}"]`;
  }

  function selectorFor(element) {
    const stableId = element.getAttribute('data-docsync-id');
    if (stableId) {
      return attributeSelector('data-docsync-id', stableId);
    }

    if (element.id) {
      return `#${cssEscape(element.id)}`;
    }

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      const tagName = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        parts.unshift(tagName);
        break;
      }

      const sameTagSiblings = [...parent.children].filter(
        (child) => child.tagName === current.tagName
      );
      const suffix =
        sameTagSiblings.length > 1
          ? `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`
          : '';
      parts.unshift(`${tagName}${suffix}`);
      current = parent;
    }

    return parts.join(' > ');
  }

  function attributesFor(element) {
    const attributes = {};
    for (const attribute of [...element.attributes].slice(0, 24)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'style' || name.startsWith('data-docsync-')) {
        continue;
      }
      attributes[attribute.name] = limit(attribute.value, 160);
    }

    const stableId = element.getAttribute('data-docsync-id');
    if (stableId) {
      attributes['data-docsync-id'] = stableId;
    }

    return attributes;
  }

  function elementText(element) {
    return (
      element.innerText ||
      element.textContent ||
      element.getAttribute('alt') ||
      element.getAttribute('aria-label') ||
      ''
    );
  }

  function indexPathFor(element) {
    const path = [];
    let current = element;
    while (current && current.parentElement) {
      path.unshift([...current.parentElement.children].indexOf(current));
      current = current.parentElement;
    }
    return path;
  }

  function headingPathFor(element) {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    const stack = [];

    for (const heading of headings) {
      const relation = heading.compareDocumentPosition(element);
      const isBeforeElement =
        heading === element || Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING);
      if (!isBeforeElement) {
        continue;
      }

      const level = Number.parseInt(heading.tagName.slice(1), 10);
      stack.splice(level - 1);
      stack[level - 1] = limit(heading.textContent, 120);
    }

    return stack.filter(Boolean);
  }

  function anchorFor(element) {
    const attributes = attributesFor(element);
    const exactText = limit(elementText(element), 240);
    const anchor = {
      selector: selectorFor(element),
      headingPath: headingPathFor(element),
      element: {
        tagName: element.tagName.toLowerCase(),
        classList: [...element.classList].slice(0, 16),
        attributes,
        indexPath: indexPathFor(element)
      },
      fingerprint: {
        textHash: hashValue(exactText),
        attributesHash: hashValue(JSON.stringify(attributes)),
        subtreeHash: hashValue(limit(element.outerHTML, 1000))
      }
    };

    const stableId = element.getAttribute('data-docsync-id');
    if (stableId) {
      anchor.stableId = stableId;
    }

    if (element.id) {
      anchor.element.id = element.id;
    }

    if (exactText) {
      anchor.textQuote = {
        exact: exactText
      };
    }

    return anchor;
  }

  function markHover(element) {
    if (hoveredElement && hoveredElement !== selectedElement) {
      hoveredElement.removeAttribute('data-docsync-hover');
    }
    hoveredElement = element;
    if (hoveredElement && hoveredElement !== selectedElement) {
      hoveredElement.setAttribute('data-docsync-hover', 'true');
    }
  }

  function markSelected(element) {
    if (selectedElement) {
      selectedElement.removeAttribute('data-docsync-selected');
    }
    selectedElement = element;
    selectedElement.removeAttribute('data-docsync-hover');
    selectedElement.setAttribute('data-docsync-selected', 'true');
  }

  function selectableFromEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return null;
    }

    const element = target.closest(selectableSelector);
    if (!element || ignoredTags.has(element.tagName)) {
      return null;
    }

    return element;
  }

  document.addEventListener(
    'mouseover',
    (event) => {
      const element = selectableFromEvent(event);
      if (element) {
        markHover(element);
      }
    },
    true
  );

  document.addEventListener(
    'mouseout',
    () => {
      if (hoveredElement && hoveredElement !== selectedElement) {
        hoveredElement.removeAttribute('data-docsync-hover');
      }
      hoveredElement = null;
    },
    true
  );

  document.addEventListener(
    'click',
    (event) => {
      const element = selectableFromEvent(event);
      if (!element) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const anchor = anchorFor(element);
      markSelected(element);
      window.parent.postMessage(
        {
          type: messageType,
          bridgeNonce,
          revisionId,
          selection: {
            anchor,
            preview: {
              tagName: anchor.element.tagName,
              selector: anchor.selector,
              text: anchor.textQuote ? anchor.textQuote.exact : '',
              headingPath: anchor.headingPath,
              stableId: anchor.stableId
            }
          }
        },
        '*'
      );
    },
    true
  );
})();
