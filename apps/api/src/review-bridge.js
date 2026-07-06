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

  function postSelection(anchor) {
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
  }

  function hasActiveTextSelection() {
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && normalizeText(selection.toString()).length >= 2);
  }

  document.addEventListener(
    'click',
    (event) => {
      // Let the pill and active text selections win over element selection.
      if (event.target instanceof Element && event.target.closest('[data-docsync-pill="true"]')) {
        return;
      }
      if (hasActiveTextSelection()) {
        return;
      }

      const element = selectableFromEvent(event);
      if (!element) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const anchor = anchorFor(element);
      markSelected(element);
      postSelection(anchor);
    },
    true
  );

  // --- Text-range selection with a floating "Add comment" pill ---------------

  let pill = null;

  function ensurePill() {
    if (pill) {
      return pill;
    }
    pill = document.createElement('button');
    pill.type = 'button';
    pill.setAttribute('data-docsync-pill', 'true');
    pill.textContent = '💬 Add comment';
    pill.style.position = 'fixed';
    pill.style.zIndex = '2147483647';
    pill.style.display = 'none';
    // Prevent the mousedown from clearing the current text selection.
    pill.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      commentOnSelection();
    });
    document.body.appendChild(pill);
    return pill;
  }

  function hidePill() {
    if (pill) {
      pill.style.display = 'none';
    }
  }

  function selectionInfo() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }
    const exact = normalizeText(selection.toString());
    if (exact.length < 2) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return null;
    }
    const container =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    const element = container ? container.closest(selectableSelector) || container : null;
    return { exact, rect, element };
  }

  function showPill() {
    const info = selectionInfo();
    if (!info || !info.element || ignoredTags.has(info.element.tagName)) {
      hidePill();
      return;
    }
    const node = ensurePill();
    node.style.display = 'block';
    // Position above the selection, clamped to the viewport.
    const width = node.offsetWidth || 130;
    let left = info.rect.left + info.rect.width / 2 - width / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - width - 6));
    let top = info.rect.top - node.offsetHeight - 8;
    if (top < 6) {
      top = info.rect.bottom + 8;
    }
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }

  function textQuoteWithContext(element, exact) {
    const quote = { exact };
    const full = normalizeText(elementText(element));
    const index = full.indexOf(exact);
    if (index >= 0) {
      const prefix = full.slice(Math.max(0, index - 40), index).trim();
      const suffix = full.slice(index + exact.length, index + exact.length + 40).trim();
      if (prefix) {
        quote.prefix = prefix;
      }
      if (suffix) {
        quote.suffix = suffix;
      }
    }
    return quote;
  }

  function commentOnSelection() {
    const info = selectionInfo();
    if (!info || !info.element) {
      return;
    }
    const anchor = anchorFor(info.element);
    anchor.textQuote = textQuoteWithContext(info.element, limit(info.exact, 240));
    anchor.fingerprint.textHash = hashValue(anchor.textQuote.exact);
    markSelected(info.element);
    postSelection(anchor);
    hidePill();
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }

  document.addEventListener('mouseup', () => {
    // Defer so the browser finalizes the selection first.
    window.setTimeout(showPill, 0);
  });

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hidePill();
    }
  });

  window.addEventListener('scroll', hidePill, true);
})();
