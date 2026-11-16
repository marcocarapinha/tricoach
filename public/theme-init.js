// aplica o tema antes do primeiro render (escuro por defeito); ficheiro externo por causa da CSP
try { if (localStorage.getItem("tricoach.theme") === "light") document.documentElement.classList.remove("dark"); } catch (e) {}
