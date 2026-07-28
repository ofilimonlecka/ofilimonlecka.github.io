/* Supertab Connect dashboard — tiny shared UI helpers */
(function () {
  "use strict";

  // A small custom dropdown rendered into `mount`.
  // opts: { value:Number, options:[{value,label}], onChange(value) }
  window.makeDropdown = function (mount, opts) {
    mount.classList.add("dropdown");
    mount.innerHTML = "";
    const state = { value: opts.value };

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dropdown-btn";
    btn.innerHTML = `<span class="cal">🗓</span> <span class="dd-label"></span> <span class="chev">▾</span>`;

    const menu = document.createElement("div");
    menu.className = "dropdown-menu";
    menu.hidden = true;
    opts.options.forEach((o) => {
      const it = document.createElement("button");
      it.type = "button";
      it.className = "dropdown-item";
      it.textContent = o.label;
      it.dataset.v = o.value;
      menu.appendChild(it);
    });

    mount.appendChild(btn);
    mount.appendChild(menu);

    const labelFor = (v) => (opts.options.find((o) => o.value === v) || {}).label || "";
    const sync = () => {
      btn.querySelector(".dd-label").textContent = labelFor(state.value);
      menu.querySelectorAll(".dropdown-item").forEach((it) =>
        it.classList.toggle("sel", Number(it.dataset.v) === state.value));
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
      state.value = Number(it.dataset.v);
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
})();
