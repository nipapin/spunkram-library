/** All checkbox storage keys + page groupings for index progress cards */
(function () {
  const pages = {
    shell: [
      "G-01:ae","G-01:pr","G-02:ae","G-02:pr","G-03:ae","G-03:pr","G-04:ae","G-04:pr",
      "G-05:ae","G-05:pr","G-06:ae","G-06:pr","G-07:ae","G-07:pr","G-08:ae","G-08:pr",
      "G-09:ae","G-09:pr","G-10:ae","G-10:pr","G-11:ae","G-11:pr","G-12:ae","G-12:pr",
      "N-01:ae","N-01:pr","N-02:ae","N-02:pr","N-03:ae","N-03:pr","N-04:ae","N-04:pr",
      "N-05:ae","N-05:pr","N-06:ae","N-06:pr","N-07:ae","N-07:pr","N-08:ae","N-08:pr",
      "N-09:ae","N-09:pr","N-10:ae","N-10:pr",
      "A-01:ae","A-01:pr","A-02:ae","A-02:pr","A-03:ae","A-03:pr","A-04:ae","A-04:pr",
      "A-05:ae","A-05:pr","A-06:ae","A-06:pr","A-07:ae","A-07:pr","A-10:ae","A-10:pr",
      "A-11:ae","A-11:pr","A-12:ae","A-12:pr","A-13:ae","A-13:pr","A-14:ae","A-14:pr",
      "A-15:ae","A-15:pr","A-16:ae","A-16:pr","A-17:ae","A-17:pr","A-18:ae","A-18:pr",
      "A-19:ae","A-19:pr","A-20:ae","A-20:pr","A-21:ae","A-21:pr","A-22:ae","A-22:pr","A-23:ae","A-23:pr",
      "S-01:ae","S-01:pr","S-02:ae","S-02:pr","S-03:ae","S-03:pr","S-04:ae","S-04:pr",
      "S-05:ae","S-05:pr","S-06:ae","S-06:pr","S-07:ae","S-07:pr","S-08:ae","S-08:pr",
      "S-09:ae","S-09:pr","S-10:ae","S-10:pr","S-11:ae","S-11:pr",
      "U-01:ae","U-01:pr","U-02:ae","U-02:pr","U-03:ae","U-03:pr","U-04:ae","U-04:pr",
      "U-05:ae","U-05:pr","U-06:ae","U-06:pr","U-07:ae","U-07:pr","U-08:ae","U-08:pr",
    ],
    market: [
      "M-01:ae","M-01:pr","M-02:ae","M-02:pr","M-03:ae","M-03:pr","M-04:ae","M-04:pr",
      "M-05:ae","M-05:pr","M-06:ae","M-06:pr","M-07:ae","M-07:pr","M-08:ae","M-08:pr",
      "M-09:ae","M-09:pr","M-10:ae","M-10:pr",
      "M-20:ae","M-20:pr","M-21:ae","M-21:pr","M-22:ae","M-22:pr","M-23:ae","M-23:pr",
      "M-24:ae","M-24:pr","M-25:ae","M-25:pr","M-26:ae","M-26:pr","M-27:ae","M-27:pr",
      "M-30:ae","M-30:pr","M-31:ae","M-31:pr","M-32:ae","M-32:pr","M-33:ae","M-33:pr",
      "M-34:ae","M-34:pr","M-35:ae","M-35:pr","M-36:ae","M-36:pr",
    ],
    editing: [
      "E-01:ae","E-01:pr","E-02:ae","E-02:pr","E-03:ae","E-03:pr",
      "E-10:ae","E-10:pr","E-11:ae","E-11:pr","E-12:ae","E-12:pr",
      "E-20:ae","E-20:pr","E-21:ae","E-21:pr","E-22:ae","E-22:pr","E-23:ae","E-23:pr",
      "E-24:ae","E-24:pr","E-25:ae","E-25:pr",
      "E-30:ae","E-30:pr","E-31:ae","E-31:pr","E-32:ae","E-32:pr","E-33:ae","E-33:pr",
      "E-34:ae","E-34:pr","E-35:ae","E-35:pr","E-36:ae","E-36:pr","E-37:ae","E-37:pr",
      "E-38:ae","E-38:pr","E-39:ae","E-39:pr","E-40:ae","E-40:pr","E-41:ae","E-41:pr","E-42:ae","E-42:pr",
      "E-50:ae","E-50:pr","E-51:ae","E-51:pr","E-52:ae","E-52:pr","E-53:ae","E-53:pr",
      "E-54:ae","E-54:pr","E-55:ae","E-55:pr","E-56:ae","E-56:pr",
      "E-60:ae","E-60:pr","E-61:ae","E-61:pr","E-62:ae","E-62:pr",
      "M-40:pr","M-41:ae","M-41:pr","M-42:ae","M-43:ae","M-43:pr","M-44:ae","M-44:pr",
      "M-45:pr","M-46:ae","M-47:pr","M-48:ae","M-48:pr",
    ],
    captions: [
      "AI-01:ae","AI-01:pr","AI-04:ae","AI-04:pr","AI-05:ae","AI-05:pr","AI-06:ae","AI-06:pr","AI-08:ae","AI-08:pr",
      "CAP-01:ae","CAP-01:pr","CAP-02:ae","CAP-02:pr","CAP-03:ae","CAP-03:pr","CAP-04:ae","CAP-04:pr",
      "CAP-05:ae","CAP-05:pr","CAP-06:ae","CAP-06:pr","CAP-07:ae","CAP-07:pr","CAP-08:ae","CAP-08:pr","CAP-09:ae","CAP-09:pr",
      "CAP-10:ae","CAP-10:pr","CAP-11:ae","CAP-11:pr","CAP-12:ae","CAP-12:pr","CAP-13:ae","CAP-13:pr",
      "CAP-14:ae","CAP-14:pr","CAP-15:ae","CAP-15:pr","CAP-16:ae","CAP-16:pr",
      "CAP-17:ae","CAP-17:pr","CAP-18:ae","CAP-18:pr","CAP-19:ae","CAP-19:pr","CAP-20:ae","CAP-20:pr",
      "CAP-AE-01:ae","CAP-AE-02:ae","CAP-AE-03:ae",
      "CAP-PR-01:pr","CAP-PR-02:pr","CAP-PR-03:pr","CAP-PR-04:pr",
    ],
    styles: [
      "ST-01:ae","ST-01:pr","ST-02:ae","ST-02:pr","ST-03:ae","ST-03:pr","ST-04:ae","ST-04:pr",
      "ST-05:ae","ST-05:pr","ST-06:ae","ST-06:pr","ST-07:ae","ST-07:pr","ST-08:ae","ST-08:pr",
      "ST-10:ae","ST-10:pr","ST-11:ae","ST-11:pr","ST-12:ae","ST-12:pr","ST-13:ae","ST-13:pr",
      "ST-14:ae","ST-14:pr","ST-15:ae","ST-15:pr","ST-16:ae","ST-16:pr","ST-17:ae","ST-17:pr","ST-18:ae","ST-18:pr",
      "ST-AE-01:ae","ST-PR-01:pr","ST-PR-02:pr",
    ],
    chapters: [
      "CH-01:ae","CH-01:pr","CH-02:ae","CH-02:pr","CH-03:ae","CH-03:pr","CH-04:ae","CH-04:pr","CH-05:ae","CH-05:pr",
      "CH-10:ae","CH-10:pr","CH-11:ae","CH-11:pr","CH-12:ae","CH-12:pr","CH-13:ae","CH-13:pr",
      "CH-14:ae","CH-14:pr","CH-15:ae","CH-15:pr","CH-16:ae","CH-16:pr","CH-17:ae","CH-17:pr",
      "CH-18:ae","CH-18:pr","CH-19:ae","CH-19:pr",
    ],
    voiceover: [
      "VO-01:ae","VO-01:pr","VO-02:ae","VO-02:pr","VO-03:ae","VO-03:pr","VO-04:ae","VO-04:pr",
      "VO-05:ae","VO-05:pr","VO-06:ae","VO-06:pr","VO-07:ae","VO-07:pr","VO-08:ae","VO-08:pr",
      "VO-09:ae","VO-09:pr","VO-10:ae","VO-10:pr","VO-11:ae","VO-11:pr","VO-12:ae","VO-12:pr",
    ],
    footages: [
      "F-01:ae","F-01:pr","F-02:ae","F-02:pr","F-03:ae","F-03:pr","F-04:ae","F-04:pr",
      "F-05:ae","F-05:pr","F-06:ae","F-06:pr","F-07:ae","F-07:pr","F-08:ae","F-08:pr",
      "F-09:ae","F-09:pr","F-10:ae","F-10:pr","F-11:ae","F-11:pr","F-12:ae","F-12:pr",
      "F-13:ae","F-13:pr","F-14:ae","F-14:pr","F-15:ae","F-15:pr","F-16:ae","F-16:pr","F-17:ae","F-17:pr",
    ],
  };

  window.QA_PAGES = pages;
  window.QA_ALL_KEYS = Object.values(pages).flat();

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-page-key]").forEach((card) => {
      const page = card.getAttribute("href")?.replace(".html", "").replace(/^\.\//, "");
      if (!page || !pages[page]) return;
      card.dataset.pageKey = pages[page].join(",");
    });
  });
})();
