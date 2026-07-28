/* Supertab Connect dashboard — tiny shared UI helpers */
(function () {
  "use strict";

  // A small custom dropdown rendered into `mount`.
  // opts: { value, options:[{value,label}], onChange(value), icon? }
  // Values may be any type (numbers or strings); the original value type from
  // `options` is preserved through selection (menu buttons store the index).
  window.makeDropdown = function (mount, opts) {
    mount.classList.add("dropdown");
    mount.innerHTML = "";
    const state = { value: opts.value };
    const icon = ("icon" in opts) ? opts.icon : "🗓";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dropdown-btn";
    const iconHtml = icon ? `<span class="cal">${icon}</span> ` : "";
    btn.innerHTML = `${iconHtml}<span class="dd-label"></span> <span class="chev">▾</span>`;

    const menu = document.createElement("div");
    menu.className = "dropdown-menu";
    menu.hidden = true;
    opts.options.forEach((o, i) => {
      const it = document.createElement("button");
      it.type = "button";
      it.className = "dropdown-item";
      it.textContent = o.label;
      it.dataset.i = i; // index into opts.options — preserves value type
      menu.appendChild(it);
    });

    mount.appendChild(btn);
    mount.appendChild(menu);

    const labelFor = (v) => (opts.options.find((o) => o.value === v) || {}).label || "";
    const sync = () => {
      btn.querySelector(".dd-label").textContent = labelFor(state.value);
      menu.querySelectorAll(".dropdown-item").forEach((it) =>
        it.classList.toggle("sel", opts.options[Number(it.dataset.i)].value === state.value));
    };
    const close = () => { menu.hidden = true; mount.classList.remove("open"); };
    sync();

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      mount.classList.toggle("open", !menu.hidden);
    });
    menu.addEventListener("click", (e) => {
      const it = e.target.closest(".dropdown-item");
      if (!it) return;
      state.value = opts.options[Number(it.dataset.i)].value;
      sync();
      close();
      opts.onChange(state.value);
    });
    document.addEventListener("click", close);

    return { get: () => state.value, set: (v) => { state.value = v; sync(); } };
  };

  window.PERIOD_OPTIONS = [
    { value: 7, label: "Last 7 days" },
    { value: 14, label: "Last 14 days" },
    { value: 30, label: "Last 30 days" },
  ];

  // Dataset switcher options, derived from the registry in data.js.
  window.DATASET_OPTIONS = (window.DATASETS || []).map((d) => ({ value: d.key, label: d.label }));
})();
