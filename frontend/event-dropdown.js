(function () {
  var category = document.getElementById("category");
  var eventSelect = document.getElementById("eventPreset");
  var eventName = document.getElementById("eventName");
  var customGroup = document.getElementById("customEventGroup");
  var customName = document.getElementById("customEventName");
  var uploadForm = document.getElementById("uploadForm");
  var uploadMessage = document.getElementById("uploadMessage");

  var events = {
    "academic": ["Hackathon", "Technical Workshop", "Others"],
    "non-academic": ["Cultural Event", "Sports", "Volunteering", "Student Council", "Kalanidhi", "Others"]
  };

  function syncEventName() {
    var isOther = eventSelect.value === "Others";
    customGroup.hidden = !isOther;
    customName.required = isOther;
    eventName.value = isOther ? customName.value.trim() : eventSelect.value;
  }

  function fillEvents() {
    var list = events[category.value] || events["academic"];

    eventSelect.innerHTML = "";

    var first = document.createElement("option");
    first.value = "";
    first.textContent = "Select an event";
    eventSelect.appendChild(first);

    list.forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      eventSelect.appendChild(opt);
    });

    eventSelect.value = "";
    customName.value = "";
    customGroup.hidden = true;
    customName.required = false;
    eventName.value = "";

    if (uploadMessage) {
      uploadMessage.textContent = "";
    }
  }

  category.addEventListener("change", fillEvents);
  category.addEventListener("input", fillEvents);
  eventSelect.addEventListener("change", syncEventName);
  customName.addEventListener("input", syncEventName);

  uploadForm.addEventListener("submit", function (event) {
    syncEventName();

    if (!eventName.value.trim()) {
      event.preventDefault();
      event.stopImmediatePropagation();

      uploadMessage.textContent = "Please select an event or enter an event name.";
      uploadMessage.style.color = "#c83e4d";
    }
  }, true);

  uploadForm.addEventListener("reset", function () {
    setTimeout(fillEvents, 0);
  });

  fillEvents();
  window.addEventListener("load", function () {
    setTimeout(fillEvents, 100);
  });
  window.addEventListener("pageshow", function () {
    setTimeout(fillEvents, 100);
  });
})();