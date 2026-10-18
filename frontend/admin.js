"use strict";

/* =========================================================
   CAMPUSACHIEVE — ADMIN DASHBOARD
   PIET | Vanilla JavaScript
   ========================================================= */


/* ---------- 1. DOM helpers ---------- */

const $ = (id) => document.getElementById(id);

const dashboardMessage = $("msg");
const studentsTableBody = $("rows");
const studentSearchInput = $("studentSearch");
const prefixFilter = $("studentPrefixFilter");

const adminRows = $("adminRows");
const adminSearchInput = $("adminSearch");

const certificatePanel = $("certPanel");
const certificateList = $("certList");

let allStudents = [];
let allAdmins = [];
let currentAdmin = null;


/* ---------- 2. API helper ---------- */

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  const contentType = response.headers.get("content-type") || "";

  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();

    data = {
      error: text || "The server returned an unexpected response."
    };
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status}).`
    );
  }

  return data;
}


/* ---------- 3. Message helpers ---------- */

function setMessage(element, message, type = "") {
  if (!element) return;

  element.textContent = message;

  element.classList.remove(
    "success",
    "error",
    "warning"
  );

  if (type) {
    element.classList.add(type);
  }
}


function setButtonLoading(button, loading, loadingText, normalText) {
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}


/* ---------- 4. Safe data helpers ---------- */

function unwrapArray(response, preferredKey) {
  if (Array.isArray(response)) {
    return response;
  }

  if (preferredKey && Array.isArray(response?.[preferredKey])) {
    return response[preferredKey];
  }

  if (Array.isArray(response?.items)) {
    return response.items;
  }

  return [];
}


function displayValue(value, fallback = "—") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}


function getRegistrationNumber(student) {
  return String(
    student.registration_no ||
    student.registration_number ||
    ""
  ).trim();
}


function getStudentName(student) {
  return String(
    student.name ||
    student.full_name ||
    "Unnamed student"
  ).trim();
}


function getCertificateCount(student) {
  const count = Number(student.certificate_count ?? 0);

  return Number.isFinite(count) && count >= 0 ? count : 0;
}


function getCertificateFilename(certificate) {
  return (
    certificate.original_filename ||
    certificate.file_name ||
    certificate.filename ||
    "Certificate file"
  );
}


function formatDate(value) {
  if (!value) return "Date not provided";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}


/* ---------- 5. Registration-prefix grouping ---------- */

function getRegistrationPrefix(registrationNumber) {
  const value = String(registrationNumber || "")
    .trim()
    .toUpperCase();

  if (!value) {
    return "OTHER";
  }

  const match = value.match(/^([A-Z]+\d*[A-Z]+)/);

  if (match) {
    return match[1];
  }

  return value.replace(/\d+$/, "") || "OTHER";
}


function compareText(first, second) {
  return String(first).localeCompare(
    String(second),
    "en",
    { sensitivity: "base", numeric: true }
  );
}


function sortStudents(students) {
  return [...students].sort((first, second) => {
    const prefixComparison = compareText(
      getRegistrationPrefix(getRegistrationNumber(first)),
      getRegistrationPrefix(getRegistrationNumber(second))
    );

    if (prefixComparison !== 0) {
      return prefixComparison;
    }

    const nameComparison = compareText(
      getStudentName(first),
      getStudentName(second)
    );

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return compareText(
      getRegistrationNumber(first),
      getRegistrationNumber(second)
    );
  });
}


/* ---------- 6. Render table cells safely ---------- */

function createCell(value, className = "") {
  const cell = document.createElement("td");

  cell.textContent = displayValue(value);

  if (className) {
    cell.className = className;
  }

  return cell;
}


function createEmptyTableRow(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = 5;
  cell.className = "table-empty";
  cell.textContent = message;

  row.appendChild(cell);

  return row;
}


/* ---------- 7. Update registration-prefix filter ---------- */

function updatePrefixFilter() {
  const previousValue = prefixFilter.value;

  const prefixes = [
    ...new Set(
      allStudents.map((student) =>
        getRegistrationPrefix(getRegistrationNumber(student))
      )
    )
  ].sort(compareText);

  prefixFilter.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All prefixes";

  prefixFilter.appendChild(allOption);

  prefixes.forEach((prefix) => {
    const option = document.createElement("option");

    option.value = prefix;
    option.textContent = prefix;

    prefixFilter.appendChild(option);
  });

  if (prefixes.includes(previousValue)) {
    prefixFilter.value = previousValue;
  } else {
    prefixFilter.value = "all";
  }
}


/* ---------- 8. Filter students ---------- */

function getFilteredStudents() {
  const searchText = studentSearchInput.value
    .trim()
    .toLowerCase();

  const selectedPrefix = prefixFilter.value;

  return sortStudents(allStudents).filter((student) => {
    const name = getStudentName(student).toLowerCase();

    const registrationNumber = getRegistrationNumber(student)
      .toLowerCase();

    const prefix = getRegistrationPrefix(
      getRegistrationNumber(student)
    );

    const matchesSearch =
      name.includes(searchText) ||
      registrationNumber.includes(searchText);

    const matchesPrefix =
      selectedPrefix === "all" ||
      prefix === selectedPrefix;

    return matchesSearch && matchesPrefix;
  });
}


/* ---------- 9. Excel export (no external library needed) ---------- */

/* CRC-32 table (zip file ke liye zaroori) */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();


function crc32(bytes) {
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}


/* Files ko ek .zip (xlsx) Blob mein pack karta hai */
function makeZipBlob(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralChunks = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);

    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);

    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    centralChunks.push(central);

    offset += local.length + size;
  });

  const centralSize = centralChunks.reduce(
    (total, chunk) => total + chunk.length,
    0
  );

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);

  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...chunks, ...centralChunks, end], {
    type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}


function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


/* rows = array of arrays. Pehli row header hoti hai (bold) */
function buildXlsxBlob(rows, columnWidths, sheetName) {
  const columnLetter = (index) => String.fromCharCode(65 + index);

  const colsXml = columnWidths
    .map(
      (width, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`
    )
    .join("");

  const rowsXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          const ref = `${columnLetter(colIndex)}${rowIndex + 1}`;
          const style = rowIndex === 0 ? ' s="1"' : "";

          if (typeof value === "number") {
            return `<c r="${ref}"${style}><v>${value}</v></c>`;
          }

          return (
            `<c r="${ref}" t="inlineStr"${style}>` +
            `<is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
          );
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const files = [
    {
      name: "[Content_Types].xml",
      content:
        xmlHeader +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>"
    },
    {
      name: "_rels/.rels",
      content:
        xmlHeader +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>"
    },
    {
      name: "xl/workbook.xml",
      content:
        xmlHeader +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
        "</workbook>"
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        xmlHeader +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>"
    },
    {
      name: "xl/styles.xml",
      content:
        xmlHeader +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2">' +
        '<font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
        "</fonts>" +
        '<fills count="2">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        "</fills>" +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        "</cellXfs>" +
        "</styleSheet>"
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content:
        xmlHeader +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<cols>${colsXml}</cols>` +
        `<sheetData>${rowsXml}</sheetData>` +
        "</worksheet>"
    }
  ];

  return makeZipBlob(files);
}


function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}


function exportStudentsToExcel(students, fileName) {
  try {
    if (!Array.isArray(students) || students.length === 0) {
      setMessage(
        dashboardMessage,
        "Export karne ke liye koi student record nahi hai.",
        "warning"
      );
      return;
    }

    const rows = [
      [
        "Registration No.",
        "Student Name",
        "Year of Passing",
        "Semester",
        "Certificates Count"
      ]
    ];

    students.forEach((student) => {
      rows.push([
        getRegistrationNumber(student),
        getStudentName(student),
        displayValue(student.year_of_passing, ""),
        displayValue(student.semester, ""),
        getCertificateCount(student)
      ]);
    });

    const blob = buildXlsxBlob(
      rows,
      [24, 30, 18, 12, 20],
      "Students"
    );

    downloadBlob(blob, fileName);

    setMessage(
      dashboardMessage,
      `${students.length} student records Excel mein export ho gaye.`,
      "success"
    );
  } catch (error) {
    console.error("Excel export failed:", error);

    setMessage(
      dashboardMessage,
      error.message || "Excel export failed.",
      "error"
    );
  }
}


/* ---------- 10. Render student directory ---------- */

function renderStudents() {
  const filteredStudents = getFilteredStudents();

  studentsTableBody.replaceChildren();

  if (filteredStudents.length === 0) {
    studentsTableBody.appendChild(
      createEmptyTableRow(
        allStudents.length
          ? "No students match your search or filter."
          : "No student records were found."
      )
    );

    $("studentResultCount").textContent =
      `Showing 0 of ${allStudents.length} students`;

    return;
  }

  let previousPrefix = null;

  filteredStudents.forEach((student) => {
    const registrationNumber = getRegistrationNumber(student);
    const prefix = getRegistrationPrefix(registrationNumber);

    if (prefix !== previousPrefix) {
      const groupRow = document.createElement("tr");
      const groupCell = document.createElement("td");

      groupCell.colSpan = 5;
      groupCell.style.background = "#f5f8ff";
      groupCell.style.color = "#2456bc";
      groupCell.style.fontWeight = "800";
      groupCell.style.fontSize = "11px";
      groupCell.style.letterSpacing = "0.04em";
      groupCell.textContent = `${prefix} · STUDENTS`;

      groupRow.appendChild(groupCell);
      studentsTableBody.appendChild(groupRow);

      previousPrefix = prefix;
    }

    const row = document.createElement("tr");

    const registrationCell = document.createElement("td");
    const registrationText = document.createElement("span");

    registrationText.className = "admin-registration-number";
    registrationText.textContent =
      displayValue(registrationNumber);

    registrationCell.appendChild(registrationText);

    const nameCell = document.createElement("td");

    const nameText = document.createElement("span");
    nameText.className = "admin-student-name";
    nameText.textContent = getStudentName(student);

    nameCell.appendChild(nameText);

    const passingYearCell = createCell(
      student.year_of_passing
    );

    const semesterCell = createCell(
      student.semester
    );

    const certificateCell = document.createElement("td");

    const certificateButton = document.createElement("button");
    certificateButton.type = "button";
    certificateButton.className = "button light";

    certificateButton.textContent =
      `View (${getCertificateCount(student)})`;

    certificateButton.addEventListener("click", () => {
      showCertificates(student);
    });

    certificateCell.appendChild(certificateButton);

    row.append(
      registrationCell,
      nameCell,
      passingYearCell,
      semesterCell,
      certificateCell
    );

    studentsTableBody.appendChild(row);
  });

  $("studentResultCount").textContent =
    `Showing ${filteredStudents.length} of ${allStudents.length} students`;
}


/* ---------- 11. Load student directory ---------- */

async function loadStudents() {
  setMessage(dashboardMessage, "Loading student records...");

  studentsTableBody.replaceChildren(
    createEmptyTableRow("Loading student records...")
  );

  try {
    const response = await api("/api/admin/students");

    allStudents = unwrapArray(response, "students");

    updatePrefixFilter();
    renderStudents();
    updateMetrics();

    setMessage(dashboardMessage, "");
  } catch (error) {
    allStudents = [];

    studentsTableBody.replaceChildren(
      createEmptyTableRow(
        error.message || "Unable to load student records."
      )
    );

    $("studentResultCount").textContent =
      "Student records could not be loaded";

    updateMetrics();

    setMessage(
      dashboardMessage,
      error.message || "Unable to load student records.",
      "error"
    );
  }
}


/* ---------- 12. Dashboard metrics ---------- */

function updateMetrics() {
  $("totalStudents").textContent = String(allStudents.length);

  const certificateTotal = allStudents.reduce(
    (total, student) => total + getCertificateCount(student),
    0
  );

  $("totalCertificates").textContent = String(certificateTotal);

  $("totalAdmins").textContent =
    allAdmins.length ? String(allAdmins.length) : "—";
}


/* ---------- 13. Open student certificates ---------- */

async function showCertificates(student) {
  certificatePanel.hidden = false;

  const studentName = getStudentName(student);
  const registrationNumber = getRegistrationNumber(student);

  $("certTitle").textContent =
    `Certificates — ${studentName} (${registrationNumber || "No registration number"})`;

  certificateList.replaceChildren();

  const loading = document.createElement("div");
  loading.className = "empty-state";
  loading.textContent = "Loading certificates...";

  certificateList.appendChild(loading);

  certificatePanel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  if (!student.id) {
    certificateList.replaceChildren();

    const message = document.createElement("div");
    message.className = "message error";
    message.textContent =
      "This student record does not include a student ID.";

    certificateList.appendChild(message);

    return;
  }

  try {
    const response = await api(
      `/api/admin/students/${encodeURIComponent(student.id)}/certificates`
    );

    const certificates = unwrapArray(response, "certificates");

    renderStudentCertificates(certificates);
  } catch (error) {
    certificateList.replaceChildren();

    const message = document.createElement("div");
    message.className = "message error";
    message.textContent =
      error.message || "Unable to load this student's certificates.";

    certificateList.appendChild(message);
  }
}


/* ---------- 14. Render certificate records ---------- */

function renderStudentCertificates(certificates) {
  certificateList.replaceChildren();

  if (certificates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";

    const heading = document.createElement("strong");
    heading.textContent = "No certificates uploaded";

    const description = document.createElement("p");
    description.textContent =
      "This student has no certificate records available.";

    empty.append(heading, description);
    certificateList.appendChild(empty);

    return;
  }

  certificates.forEach((certificate) => {
    const row = document.createElement("div");
    row.className = "certificate-item";

    const info = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent =
      certificate.event_name || "Untitled certificate";

    const category = String(
      certificate.category || ""
    ).toLowerCase() === "academic"
      ? "academic"
      : "non-academic";

    const badge = document.createElement("span");
    badge.className = `category-badge ${category}`;
    badge.textContent =
      category === "academic" ? "Academic" : "Non-Academic";

    const details = document.createElement("small");
    details.textContent =
      `${getCertificateFilename(certificate)} · ` +
      formatDate(certificate.event_date || certificate.uploaded_at);

    info.append(title, badge, details);

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "button light";
    viewButton.textContent = "View";

    viewButton.addEventListener("click", () => {
      openCertificate(certificate, viewButton);
    });

    row.append(info, viewButton);

    certificateList.appendChild(row);
  });
}


/* ---------- 15. Open a certificate file ---------- */

async function openCertificate(certificate, button) {
  if (!certificate.id) {
    setMessage(
      dashboardMessage,
      "The certificate record has no ID.",
      "error"
    );

    return;
  }

  const newTab = window.open("about:blank", "_blank");

  if (!newTab) {
    setMessage(
      dashboardMessage,
      "The browser blocked the new tab. Allow pop-ups and try again.",
      "warning"
    );

    return;
  }

  newTab.opener = null;

  const previousText = button.textContent;

  button.disabled = true;
  button.textContent = "Opening...";

  try {
    const response = await api(
      `/api/certificates/${encodeURIComponent(certificate.id)}/file`
    );

    if (!response.url) {
      throw new Error("The server did not return a file URL.");
    }

    newTab.location.replace(response.url);
  } catch (error) {
    newTab.close();

    setMessage(
      dashboardMessage,
      error.message || "Unable to open the certificate.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}


/* ---------- 16. Close certificate panel ---------- */

$("closeCertPanel").addEventListener("click", () => {
  certificatePanel.hidden = true;
});


/* ---------- 17. Admin directory ---------- */

async function loadAdmins() {
  adminRows.replaceChildren();

  const loading = document.createElement("div");
  loading.className = "empty-state";
  loading.textContent = "Loading administrator records...";

  adminRows.appendChild(loading);

  try {
    const response = await api("/api/admin/admins");

    allAdmins = unwrapArray(response, "admins");

    renderAdmins();
    updateMetrics();
  } catch (error) {
    allAdmins = [];

    adminRows.replaceChildren();

    const message = document.createElement("div");
    message.className = "message warning";
    message.textContent =
      "Administrator listing requires the GET /api/admin/admins backend route.";

    adminRows.appendChild(message);

    $("adminResultCount").textContent =
      "Administrator listing unavailable";

    updateMetrics();
  }
}


function getAdminName(admin) {
  return String(
    admin.name ||
    admin.full_name ||
    admin.email ||
    "Administrator"
  );
}


function renderAdmins() {
  const search = adminSearchInput.value
    .trim()
    .toLowerCase();

  const filteredAdmins = allAdmins.filter((admin) => {
    const name = getAdminName(admin).toLowerCase();
    const email = String(admin.email || "").toLowerCase();

    return name.includes(search) || email.includes(search);
  });

  adminRows.replaceChildren();

  if (filteredAdmins.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";

    const heading = document.createElement("strong");
    heading.textContent = allAdmins.length
      ? "No matching administrators"
      : "No administrator records available";

    const description = document.createElement("p");
    description.textContent = allAdmins.length
      ? "Try another name or email address."
      : "Configure the administrator-listing API to load records.";

    empty.append(heading, description);
    adminRows.appendChild(empty);
  } else {
    filteredAdmins.forEach((admin) => {
      const row = document.createElement("div");
      row.className = "admin-managed-item";

      const avatar = document.createElement("div");
      avatar.className = "admin-managed-avatar";
      avatar.setAttribute("aria-hidden", "true");

      avatar.textContent =
        getAdminName(admin).charAt(0).toUpperCase() || "A";

      const info = document.createElement("div");
      info.className = "admin-managed-copy";

      const name = document.createElement("strong");
      name.textContent = getAdminName(admin);

      const email = document.createElement("span");
      email.textContent = admin.email || "Email unavailable";

      info.append(name, email);
      row.append(avatar, info);

      adminRows.appendChild(row);
    });
  }

  $("adminResultCount").textContent =
    `Showing ${filteredAdmins.length} of ${allAdmins.length} administrators`;
}


/* ---------- 18. Create administrator ---------- */

$("createAdminForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = $("createAdminButton");
  const message = $("adminManagementMessage");

  const name = $("newAdminName").value.trim();
  const email = $("newAdminEmail").value.trim();
  const password = $("newAdminPassword").value;

  if (!name || !email || !password) {
    setMessage(
      message,
      "Please complete all administrator fields.",
      "error"
    );

    return;
  }

  if (password.length < 14) {
    setMessage(
      message,
      "Use a temporary password of at least 14 characters.",
      "error"
    );

    return;
  }

  setButtonLoading(
    button,
    true,
    "Creating...",
    "Create administrator →"
  );

  setMessage(message, "Creating administrator account...");

  try {
    await api("/api/admin/admins", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        name,
        email,
        password
      })
    });

    form.reset();

    setMessage(
      message,
      "Administrator created successfully.",
      "success"
    );

    await loadAdmins();
  } catch (error) {
    setMessage(
      message,
      error.message ||
      "Unable to create an administrator. Check the backend API.",
      "error"
    );
  } finally {
    setButtonLoading(
      button,
      false,
      "Creating...",
      "Create administrator →"
    );
  }
});


/* ---------- 19. Change current admin password ---------- */

$("changePassword").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const message = $("passwordMsg");
  const submitButton = form.querySelector('button[type="submit"]');

  const currentPassword = $("currentPassword").value;
  const newPassword = $("newPassword").value;
  const confirmPassword = $("confirmPassword").value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    setMessage(
      message,
      "Please fill in all password fields.",
      "error"
    );

    return;
  }

  if (newPassword.length < 14) {
    setMessage(
      message,
      "Your new password must contain at least 14 characters.",
      "error"
    );

    return;
  }

  if (newPassword !== confirmPassword) {
    setMessage(
      message,
      "The new password and confirmation do not match.",
      "error"
    );

    $("confirmPassword").focus();
    return;
  }

  if (newPassword === currentPassword) {
    setMessage(
      message,
      "Choose a new password different from your current password.",
      "error"
    );

    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Updating password...";

  setMessage(message, "Updating your password...");

  try {
    await api("/auth/admin/change-password", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });

    form.reset();

    setMessage(
      message,
      "Password updated successfully.",
      "success"
    );

    setMessage(
      dashboardMessage,
      "Your administrator password has been updated.",
      "success"
    );

    $("passwordPanel").hidden = true;
  } catch (error) {
    setMessage(
      message,
      error.message ||
      "Unable to update your password.",
      "error"
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Update password";
  }
});


/* ---------- 20. Search, filter and export handlers ---------- */

studentSearchInput.addEventListener("input", renderStudents);

prefixFilter.addEventListener("change", renderStudents);

adminSearchInput.addEventListener("input", renderAdmins);


// Export all student records.
$("exportAllStudents").addEventListener("click", () => {
  exportStudentsToExcel(
    sortStudents(allStudents),
    "CampusAchieve_All_Students.xlsx"
  );
});


// Export only the records matching the current search and filter.
$("exportFilteredStudents").addEventListener("click", () => {
  exportStudentsToExcel(
    getFilteredStudents(),
    "CampusAchieve_Filtered_Students.xlsx"
  );
});


$("refreshStudents").addEventListener("click", async () => {
  const button = $("refreshStudents");

  button.disabled = true;
  button.textContent = "Refreshing...";

  try {
    await loadStudents();
  } finally {
    button.disabled = false;
    button.textContent = "↻ Refresh";
  }
});


$("refreshAdmins").addEventListener("click", async () => {
  const button = $("refreshAdmins");

  button.disabled = true;
  button.textContent = "Refreshing...";

  try {
    await loadAdmins();
  } finally {
    button.disabled = false;
    button.textContent = "↻ Refresh";
  }
});


/* ---------- 21. Logout ---------- */

$("logout").addEventListener("click", async () => {
  const button = $("logout");

  button.disabled = true;
  button.textContent = "Signing out...";

  try {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });
  } finally {
    window.location.assign("/admin");
  }
});


/* ---------- 22. Reveal animation ---------- */

function initialiseDashboardAnimations() {
  if (
    !("IntersectionObserver" in window) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  const sections = document.querySelectorAll("[data-reveal]");

  const observer = new IntersectionObserver(
    (entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.animate(
          [
            { opacity: 0, transform: "translateY(12px)" },
            { opacity: 1, transform: "translateY(0)" }
          ],
          {
            duration: 350,
            easing: "ease-out",
            fill: "both"
          }
        );

        currentObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.08 }
  );

  sections.forEach((section) => {
    observer.observe(section);
  });
}


/* ---------- 23. Load and verify admin session ---------- */

async function initialiseAdminDashboard() {
  initialiseDashboardAnimations();

  try {
    const session = await api("/api/me");

    if (
      session.authenticated === false ||
      session.role !== "admin"
    ) {
      window.location.assign("/admin");
      return;
    }

    currentAdmin =
      session.admin ||
      session.user ||
      session;

    const name =
      currentAdmin.name ||
      currentAdmin.full_name ||
      currentAdmin.email ||
      "Administrator";

    $("adminName").textContent = name;

    $("adminAvatar").textContent =
      name.trim().charAt(0).toUpperCase() || "A";

    if (
      session.mustChangePassword === true ||
      currentAdmin.must_change_password === true
    ) {
      $("passwordPanel").hidden = false;

      $("passwordPanel").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    await Promise.all([
      loadStudents(),
      loadAdmins()
    ]);

  } catch (error) {
    setMessage(
      dashboardMessage,
      error.message ||
      "Unable to verify your administrator session.",
      "error"
    );
  }
}


/* ---------- 24. Start the dashboard ---------- */

initialiseAdminDashboard();