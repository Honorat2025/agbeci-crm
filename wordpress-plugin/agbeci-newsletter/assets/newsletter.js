/* Agbeci Newsletter : envoie le formulaire au CRM sans recharger la page. */
(function () {
  "use strict";

  function setMessage(form, text, kind) {
    var msg = form.querySelector(".agbeci-nl__msg");
    if (!msg) return;
    msg.textContent = text;
    msg.className = "agbeci-nl__msg" + (kind ? " agbeci-nl__msg--" + kind : "");
  }

  function onSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector("button[type=submit]");
    var email = form.elements.email.value.trim();
    var consent = form.elements.consent.checked;

    if (!email || email.indexOf("@") < 1) {
      setMessage(form, "Merci d'indiquer une adresse email valide.", "error");
      form.elements.email.focus();
      return;
    }
    if (!consent) {
      setMessage(form, "Merci de cocher la case pour accepter de recevoir la newsletter.", "error");
      return;
    }

    button.disabled = true;
    setMessage(form, "Envoi en cours…", "");

    fetch(form.getAttribute("data-endpoint"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        firstName: form.elements.firstName.value.trim(),
        consent: true,
        website: form.elements.website.value,
        source: window.location.href.slice(0, 400)
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return { ok: false }; });
      })
      .then(function (data) {
        if (data && data.ok) {
          setMessage(form, data.message || "Merci ! Vérifiez votre boîte mail pour confirmer votre inscription.", "success");
          form.reset();
        } else {
          setMessage(form, (data && data.error) || "Une erreur est survenue. Réessayez dans un instant.", "error");
        }
      })
      .catch(function () {
        setMessage(form, "Impossible de joindre le serveur. Réessayez dans un instant.", "error");
      })
      .then(function () {
        button.disabled = false;
      });
  }

  function init() {
    var forms = document.querySelectorAll("form.agbeci-nl");
    for (var i = 0; i < forms.length; i++) {
      forms[i].addEventListener("submit", onSubmit);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
