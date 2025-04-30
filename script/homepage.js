const content = {
    zh: {
      title: "你好",
      intro: "一位熱愛創造的資工男。",
      projectTitle: "專案作品",
      contact: "聯絡我：example@email.com"
    },
    en: {
      title: "Hi",
      intro: "A computer science student passionate about building things.",
      projectTitle: "Projects",
      contact: "Contact: example@email.com"
    }
  };
  
  function setLanguage(lang) {
    document.getElementById("title").textContent = content[lang].title;
    document.getElementById("intro-text").textContent = content[lang].intro;
    document.getElementById("project-title").textContent = content[lang].projectTitle;
    document.getElementById("contact").textContent = content[lang].contact;
  }
  