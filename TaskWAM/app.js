(() => {
  'use strict';

  const start = () => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const byId = (id) => document.getElementById(id);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mediaState = new WeakMap();
    let activeDialog = null;
    let lastDialogTrigger = null;
    let activeFlip = null;

    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
    document.body.append(announcement);
    const announce = (text) => { announcement.textContent = text; };
    const stateFor = (video) => {
      if (!mediaState.has(video)) mediaState.set(video, { userPaused: false, ignorePause: false, pending: false });
      return mediaState.get(video);
    };
    const isVisible = (element) => {
      if (!element || element.closest('[hidden]') || element.closest('dialog:not([open])')
        || element.closest('details:not([open])')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
        && rect.right > 0 && rect.left < window.innerWidth;
    };
    const ensureLoaded = (video) => {
      if (!video) return;
      const source = video.dataset.src;
      if (source && video.getAttribute('src') !== source) {
        video.src = source;
        video.load();
      }
      let changed = false;
      $$('source[data-src]', video).forEach((item) => {
        if (item.getAttribute('src') !== item.dataset.src) {
          item.src = item.dataset.src;
          changed = true;
        }
      });
      if (changed) video.load();
    };
    const pauseVideo = (video) => {
      if (!video || video.paused) return;
      stateFor(video).ignorePause = true;
      video.pause();
    };
    const playVideo = async (video, userInitiated = false) => {
      if (!video) return;
      const state = stateFor(video);
      if (userInitiated) state.userPaused = false;
      if (state.pending || state.userPaused || document.hidden) return;
      if (!userInitiated && video.dataset.stopAtEnd === 'true' && video.ended) return;
      if (activeDialog && !activeDialog.contains(video)) return;
      if (!userInitiated && (!isVisible(video) || reducedMotion.matches)) return;
      ensureLoaded(video);
      state.pending = true;
      try { await video.play(); } catch (_) { /* Native controls remain available if playback is declined. */ }
      finally { state.pending = false; }
    };
    const pauseWithin = (root) => { if (root) $$('video', root).forEach(pauseVideo); };
    const refreshPlayback = () => {
      $$('video[data-autoplay]').forEach((video) => {
        if (isVisible(video) && !document.hidden && (!activeDialog || activeDialog.contains(video))) playVideo(video);
        else pauseVideo(video);
      });
    };
    const setVideo = (video, file, poster) => {
      if (!video) return;
      pauseVideo(video);
      const state = stateFor(video);
      state.userPaused = false;
      video.dataset.src = file;
      if (poster) video.poster = poster;
      if (isVisible(video)) {
        ensureLoaded(video);
        playVideo(video);
      }
    };
    $$('video').forEach((video) => {
      stateFor(video);
      video.muted = true;
      video.playsInline = true;
      // This controller, rather than the HTML autoplay flag, owns visibility playback.
      if (video.hasAttribute('data-autoplay')) video.autoplay = false;
      video.addEventListener('pause', () => {
        const state = stateFor(video);
        if (state.ignorePause) state.ignorePause = false;
        else if (!video.ended) state.userPaused = true;
      });
      video.addEventListener('play', () => {
        stateFor(video).userPaused = false;
      });
      video.addEventListener('error', () => {
        if (isVisible(video)) announce('This video could not load. Please try playing it again.');
      });
      // Native play controls can request a deferred source without a custom player.
      video.addEventListener('pointerdown', () => ensureLoaded(video), { passive: true });
      video.addEventListener('keydown', () => ensureLoaded(video));
    });

    if ('IntersectionObserver' in window) {
      const loadObserver = new IntersectionObserver((entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (isIntersecting && !target.closest('[hidden]') && !target.closest('dialog:not([open])')
            && !target.closest('details:not([open])')) ensureLoaded(target);
        });
      }, { rootMargin: '240px 0px' });
      const playbackObserver = new IntersectionObserver((entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (isIntersecting) playVideo(target);
          else pauseVideo(target);
        });
      }, { threshold: [0, 0.12] });
      $$('video[data-autoplay]').forEach((video) => {
        loadObserver.observe(video);
        playbackObserver.observe(video);
      });
      // The full demonstration is a single inline player, loaded as it approaches the viewport.
      const fullDemo = byId('full-demo-video');
      if (fullDemo) loadObserver.observe(fullDemo);
    } else {
      let queued = false;
      window.addEventListener('scroll', () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; refreshPlayback(); });
      }, { passive: true });
      window.addEventListener('resize', refreshPlayback, { passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) $$('video').forEach(pauseVideo);
      else refreshPlayback();
    });
    $$('details').forEach((details) => {
      details.addEventListener('toggle', () => {
        if (!details.open) pauseWithin(details);
        requestAnimationFrame(refreshPlayback);
      });
    });
    const onMotionChange = () => {
      if (reducedMotion.matches) $$('video[data-autoplay]').forEach(pauseVideo);
      else refreshPlayback();
    };
    if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', onMotionChange);
    else reducedMotion.addListener(onMotionChange);

    const markSelected = (buttons, selected) => {
      buttons.forEach((button) => {
        const active = button === selected;
        button.classList.toggle('is-active', active);
        button.classList.toggle('active', active);
        if (button.getAttribute('role') === 'tab') {
          button.setAttribute('aria-selected', String(active));
          button.tabIndex = active ? 0 : -1;
        } else button.setAttribute('aria-pressed', String(active));
      });
    };
    const choices = (selector, attribute, choose) => {
      const buttons = $$(selector);
      buttons.forEach((button, index) => {
        button.addEventListener('click', (event) => {
          markSelected(buttons, button);
          choose(button.getAttribute(attribute), button, event);
        });
        button.addEventListener('keydown', (event) => {
          let next;
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = buttons.length - 1;
          if (next === undefined) return;
          event.preventDefault();
          buttons[next].focus();
          buttons[next].click();
        });
      });
      return buttons;
    };

    const mobileToggle = byId('mobile-toggle');
    const nav = byId('nav-links');
    const closeMenu = () => {
      mobileToggle?.setAttribute('aria-expanded', 'false');
      nav?.classList.remove('is-open');
      nav?.classList.remove('open');
    };
    mobileToggle?.addEventListener('click', () => {
      const open = mobileToggle.getAttribute('aria-expanded') !== 'true';
      mobileToggle.setAttribute('aria-expanded', String(open));
      nav?.classList.toggle('is-open', open);
      nav?.classList.toggle('open', open);
    });
    if (nav) $$('a', nav).forEach((link) => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
    const scrollToSection = (section) => {
      if (!section) return;
      closeMenu();
      const headerHeight = $('.site-header')?.getBoundingClientRect().height || 72;
      section.style.scrollMarginTop = `${Math.ceil(headerHeight + 24)}px`;
      section.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    };
    const header = $('.site-header');
    let headerUpdateQueued = false;
    const updateHeader = () => {
      header?.classList.toggle('is-scrolled', window.scrollY > 40);
      headerUpdateQueued = false;
    };
    window.addEventListener('scroll', () => {
      if (headerUpdateQueued) return;
      headerUpdateQueued = true;
      requestAnimationFrame(updateHeader);
    }, { passive: true });
    updateHeader();
    $$('a[href^="#"]:not([data-full-demo])').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
          || event.shiftKey || event.altKey) return;
        const hash = link.getAttribute('href');
        const section = hash.length > 1 ? byId(hash.slice(1)) : null;
        if (!section) return;
        event.preventDefault();
        scrollToSection(section);
        if (window.location.hash !== hash) window.history.pushState(null, '', hash);
        if (event.detail === 0) {
          if (!section.hasAttribute('tabindex')) section.tabIndex = -1;
          section.focus({ preventScroll: true });
        }
      });
    });

    const methods = {
      overview: { title: '', description: '' },
      mode: { title: 'Mode Tokens: ground task requirements', description: 'Mode Tokens retrieve representations from a learnable codebook and ground them in the full instruction context. They encode fine-grained execution requirements, such as ordering, timing, repetition, and arm assignment, and remain available throughout execution.', rect: [54.5, 1.5, 44.5, 48.5] },
      state: { title: 'State Tokens: track execution progress', description: 'State Tokens aggregate executed actions, their observed outcomes, and visual changes. A causal temporal encoder processes these interactions in execution order, updating the progress representation as new robot–environment feedback arrives.', rect: [54.5, 55, 44.5, 44] },
      steer: { title: 'Future steering: condition world and action generation', description: 'The structured task state conditions both world and action streams through attention and modulation. Task-state-conditioned residual corrections further steer their predictions, while preserving the backbone’s native generation structure.', rect: [1, 1, 52, 79] }
    };
    const selectMethod = (key) => {
      const method = methods[key];
      if (!method) return;
      if (byId('method-copy')) byId('method-copy').hidden = key === 'overview';
      if (byId('method-title')) byId('method-title').textContent = method.title;
      if (byId('method-description')) byId('method-description').textContent = method.description;
      if (byId('method-figure')) byId('method-figure').dataset.view = key;
      const focus = byId('method-focus');
      if (focus) {
        focus.hidden = !method.rect;
        focus.dataset.focus = key;
        focus.style.borderColor = key === 'state' ? 'var(--blue)' : key === 'steer' ? 'var(--green)' : 'var(--orange)';
        if (method.rect) {
          const [left, top, width, height] = method.rect;
          Object.assign(focus.style, { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, right: 'auto', bottom: 'auto', pointerEvents: 'none' });
        }
      }
    };
    const methodButtons = choices('[data-method]', 'data-method', selectMethod);
    if (methodButtons.length) { markSelected(methodButtons, methodButtons.find((b) => b.dataset.method === 'overview') || methodButtons[0]); selectMethod('overview'); }

    const problemButtons = choices('[data-problem]', 'data-problem', (key) => {
      ['requirements', 'progress'].forEach((name) => {
        const panel = byId(`problem-${name}`);
        if (!panel) return;
        if (name !== key) pauseWithin(panel);
        panel.hidden = name !== key;
      });
      requestAnimationFrame(refreshPlayback);
    });
    if (problemButtons.length) markSelected(problemButtons, problemButtons.find((b) => b.dataset.problem === 'requirements') || problemButtons[0]);

    $$('[data-replay]').forEach((button) => button.addEventListener('click', () => {
      let videos;
      try { videos = $$(button.dataset.replay).filter((node) => node instanceof HTMLVideoElement); }
      catch (_) { videos = []; }
      videos.forEach((video) => {
        pauseVideo(video);
        stateFor(video).userPaused = false;
        ensureLoaded(video);
        try { video.currentTime = 0; } catch (_) { /* A new source starts at zero. */ }
      });
      videos.forEach((video) => playVideo(video, true));
      if (videos.length) announce('Replaying the selected videos from the beginning.');
    }));

    const tasks = {
      cups: { title: 'Color-Order Cups', description: 'Place colored cups in the selected sequence.', file: 'cups-rgb' },
      cubes: { title: 'Size-Order Cubes', description: 'Follow the instructed small-to-large or large-to-small cube order.', file: 'cubes' },
      hammer: { title: 'Arm-Assigned Hammering', description: 'Pick up the hammer and strike the block with the instructed arm.', file: 'hammer' },
      bread: { title: 'Repeated Bread Cutting', description: 'Track repeated cuts and stop after the instructed count.', image: 'bread-poster' },
      cheese: { title: 'Cooking & Cheese', description: 'Collect cream cheese during heating or after the microwave is reopened.', file: 'cheese' },
      juice: { title: 'Cooking & Juice', description: 'Collect orange juice during heating or after the microwave is reopened.', file: 'juice' },
      cleanup: { title: 'Cooking & Cleanup', description: 'Collect cream cheese and orange juice at the instructed point in the heating routine.', file: 'cleanup' },
      breakfast: { title: 'Cooking & Breakfast', description: 'Collect a bowl and butter at the instructed point in the heating routine.', file: 'breakfast' }
    };
    let currentTask = 'cups';
    let currentOrder = 'rgb';
    const variants = byId('bench-variants');
    const variantTemplates = new Map();
    if (variants) $$('button', variants).forEach((button) => {
      const order = (button.dataset.variant || button.textContent.trim()).toLowerCase();
      if (['rgb', 'grb', 'bgr'].includes(order)) variantTemplates.set(order, button.cloneNode(true));
    });
    const variantClass = variants?.querySelector('button')?.className.replace(/\b(?:active|is-active)\b/g, '').trim() || 'variant';
    const selectOrder = (order) => {
      if (!['rgb', 'grb', 'bgr'].includes(order)) return;
      currentOrder = order;
      setVideo(byId('bench-video'), `assets/cups-${order}.mp4`, `assets/cups-${order}.jpg`);
      if (byId('bench-description')) byId('bench-description').textContent = `Place colored cups in ${order.toUpperCase()} order.`;
      if (variants) markSelected($$('button', variants), $(`[data-order="${order}"]`, variants));
    };
    const renderVariants = (key) => {
      if (!variants) return;
      variants.replaceChildren();
      if (key === 'cups') {
        ['rgb', 'grb', 'bgr'].forEach((order) => {
          const button = variantTemplates.has(order) ? variantTemplates.get(order).cloneNode(true) : document.createElement('button');
          button.type = 'button';
          button.className = variantClass;
          button.dataset.order = order;
          button.dataset.variant = order;
          if (!variantTemplates.has(order)) button.textContent = order.toUpperCase();
          button.setAttribute('aria-label', `Show ${order.toUpperCase()} cup order`);
          button.addEventListener('click', () => selectOrder(order));
          variants.append(button);
        });
        markSelected($$('button', variants), $(`[data-order="${currentOrder}"]`, variants));
      } else {
        const label = document.createElement('span');
        label.className = 'recorded-example';
        label.textContent = key === 'bread' ? 'Scene illustration' : 'Recorded example';
        variants.append(label);
      }
    };
    const selectTask = (key, _button, event) => {
      const task = tasks[key];
      if (!task) return;
      activeFlip?.cancel();
      currentTask = key;
      const feature = byId('bench-feature');
      const grid = byId('bench-grid');
      if (feature) feature.hidden = false;
      if (grid) grid.hidden = true;
      const video = byId('bench-video');
      const poster = byId('bench-poster');
      if (byId('bench-title')) byId('bench-title').textContent = task.title;
      if (byId('bench-description')) byId('bench-description').textContent = task.description;
      if (video) video.hidden = Boolean(task.image);
      if (poster) {
        poster.hidden = !task.image;
        if (task.image) { poster.src = `assets/${task.image}.jpg`; poster.alt = `${task.title} task scene`; }
      }
      if (task.image) pauseVideo(video);
      else {
        const file = key === 'cups' ? `cups-${currentOrder}` : task.file;
        setVideo(video, `assets/${file}.mp4`, `assets/${file}.jpg`);
      }
      renderVariants(key);
      if (key === 'cups') selectOrder(currentOrder);
      if (event) {
        feature?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
        if (event.detail === 0 && byId('bench-title')) {
          byId('bench-title').tabIndex = -1;
          byId('bench-title').focus({ preventScroll: true });
        }
        announce(`${task.title} selected.`);
      }
      requestAnimationFrame(refreshPlayback);
    };
    choices('[data-task]', 'data-task', selectTask);
    if (byId('bench-video')) selectTask('cups');

    const snapshotMedia = (media) => {
      if (media instanceof HTMLVideoElement && media.readyState >= 2) {
        try {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(1, 960 / media.videoWidth);
          canvas.width = Math.round(media.videoWidth * ratio);
          canvas.height = Math.round(media.videoHeight * ratio);
          canvas.getContext('2d').drawImage(media, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.9);
        } catch (_) { /* Use the supplied poster if a frame cannot be captured. */ }
      }
      return media?.poster || media?.currentSrc || media?.src || '';
    };
    byId('explore-bench')?.addEventListener('click', () => {
      const feature = byId('bench-feature');
      const grid = byId('bench-grid');
      if (!feature || !grid) return;
      activeFlip?.cancel();
      const media = tasks[currentTask].image ? byId('bench-poster') : byId('bench-video');
      const first = media?.getBoundingClientRect();
      const picture = snapshotMedia(media);
      const moveFocus = feature.contains(document.activeElement);
      pauseWithin(feature);
      feature.hidden = true;
      grid.hidden = false;
      const targetButton = $(`[data-task="${currentTask}"]`, grid) || $('[data-task]', grid);
      const target = targetButton?.querySelector('img') || $('img', grid);
      // Keep the captured frame at the destination so the shrink ends continuously.
      if (target && picture) target.src = picture;
      if (moveFocus) targetButton?.focus({ preventScroll: true });
      const alignGrid = () => {
        if (grid.hidden) return;
        window.scrollTo({
          top: Math.max(0, window.scrollY + grid.getBoundingClientRect().top - 100),
          behavior: reducedMotion.matches ? 'auto' : 'smooth'
        });
      };
      if (reducedMotion.matches || !target || !first?.width || !picture || !Element.prototype.animate) {
        alignGrid();
        return;
      }
      const last = target.getBoundingClientRect();
      if (!last.width || !last.height) { alignGrid(); return; }
      const clone = document.createElement('img');
      clone.src = picture;
      clone.alt = '';
      clone.setAttribute('aria-hidden', 'true');
      Object.assign(clone.style, { position: 'fixed', left: `${first.left}px`, top: `${first.top}px`, width: `${first.width}px`, height: `${first.height}px`, objectFit: 'contain', background: '#fff', transformOrigin: '0 0', zIndex: '1000', pointerEvents: 'none', borderRadius: '12px' });
      document.body.append(clone);
      const previousOpacity = target.style.opacity;
      target.style.opacity = '0';
      const animation = clone.animate([
        { transform: 'translate(0, 0) scale(1, 1)' },
        { transform: `translate(${last.left - first.left}px, ${last.top - first.top}px) scale(${last.width / first.width}, ${last.height / first.height})` }
      ], { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      activeFlip = animation;
      const cleanup = () => {
        clone.remove();
        target.style.opacity = previousOpacity;
        if (activeFlip === animation) activeFlip = null;
        // Scroll after FLIP so its fixed viewport coordinates remain accurate.
        alignGrid();
      };
      animation.finished.then(cleanup, cleanup);
    });

    const realExamples = {
      toast: { title: 'Bread toasting & spreading', description: 'Follow the breakfast routine from loading and heating bread to retrieval and spreading.', platform: 'AgileX Piper · 6-DoF dual arms', speed: '2×', baked: true },
      nesting: { title: 'Ordered cup nesting', description: 'TaskWAM follows the required cup sequence in a real-world manipulation example.', platform: 'Franka Research 3 · Single arm', speed: '4×' },
      spreading: { title: 'Bread retrieval and spreading', description: 'Maintain execution progress through the bread retrieval stage.', platform: 'AgileX Piper · 6-DoF dual arms', speed: '2.5×' },
      cutting: { title: 'Repeated bread cutting', description: 'Three consecutive cuts with dexterous hands.', platform: 'Unitree G1 · Dexterous hands', speed: '2×' },
      fluid: { title: 'Fluid manipulation', description: 'TaskWAM pours into the receiving dish.', platform: 'AgileX Nero · 7-DoF dual arms', file: 'fluid-taskwam', speed: '2×' }
    };
    $$('video[data-real-example]').forEach((video) => {
      const key = video.dataset.realExample;
      const item = realExamples[key];
      if (!item) return;
      const stopAtEnd = key === 'cutting';
      video.dataset.stopAtEnd = String(stopAtEnd);
      video.loop = !stopAtEnd;
      const speedLabel = video.closest('.video-box')?.querySelector('.speed-label');
      if (speedLabel) {
        speedLabel.hidden = Boolean(item.baked);
        speedLabel.textContent = item.speed || '';
      }
      // Each robot keeps its own player and playback position as readers scroll.
      // These files already contain the requested speed-up; playback stays at 1×.
      if (!video.dataset.src && !video.getAttribute('src')) {
        const file = item.file || key;
        const revision = stopAtEnd ? '?v=three-cut-clean' : '';
        video.dataset.src = `assets/${file}.mp4${revision}`;
        if (!video.getAttribute('poster')) video.poster = `assets/${file}.jpg${revision}`;
      }
    });

    const openDialog = (dialog, trigger) => {
      if (!dialog) return;
      lastDialogTrigger = trigger;
      activeDialog = dialog;
      document.body.classList.add('modal-open');
      $$('video').forEach(pauseVideo);
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      $$('video', dialog).forEach((video) => { ensureLoaded(video); playVideo(video, true); });
      $('[data-close-dialog]', dialog)?.focus();
    };
    const dialogClosed = (dialog) => {
      pauseWithin(dialog);
      if (activeDialog === dialog) activeDialog = null;
      if (!activeDialog) document.body.classList.remove('modal-open');
      const trigger = lastDialogTrigger;
      lastDialogTrigger = null;
      trigger?.focus({ preventScroll: true });
      requestAnimationFrame(refreshPlayback);
    };
    const closeDialog = (dialog) => {
      if (!dialog) return;
      if (typeof dialog.close === 'function') dialog.close();
      else { dialog.removeAttribute('open'); dialogClosed(dialog); }
    };
    $$('[data-full-demo]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault();
      const video = byId('full-demo-video');
      const section = byId('demo');
      if (!video || !section) return;
      $$('video').filter((item) => item !== video).forEach(pauseVideo);
      scrollToSection(section);
      playVideo(video, true);
    }));
    $$('[data-open-figure]').forEach((button) => button.addEventListener('click', () => openDialog(byId(button.dataset.openFigure || 'figure-dialog'), button)));
    $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog') || activeDialog)));
    $$('dialog').forEach((dialog) => {
      dialog.addEventListener('close', () => dialogClosed(dialog));
      dialog.addEventListener('cancel', () => pauseWithin(dialog));
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && activeDialog && typeof activeDialog.close !== 'function') closeDialog(activeDialog);
    });

    if ('IntersectionObserver' in window && nav) {
      const links = $$('a[href^="#"]', nav);
      const sections = links.map((link) => byId(link.getAttribute('href').slice(1))).filter(Boolean);
      const navObserver = new IntersectionObserver((entries) => {
        const current = entries.find((entry) => entry.isIntersecting);
        if (!current) return;
        links.forEach((link) => {
          const selected = link.getAttribute('href') === `#${current.target.id}`;
          link.classList.toggle('is-active', selected);
          link.classList.toggle('active', selected);
          if (selected) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }, { rootMargin: '-20% 0px -65% 0px', threshold: 0 });
      sections.forEach((section) => navObserver.observe(section));
    }
    requestAnimationFrame(refreshPlayback);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
