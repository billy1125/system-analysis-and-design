// UI-03 register an issue (FR-ISS-01, 02)

const form = document.getElementById('issue-form');

async function load() {
  const { now, products, defect_types } = await api('GET', '/api/issues/new-form');
  document.getElementById('fields').innerHTML = issueFieldsHtml({}, products, defect_types, now);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { id, message } = await api('POST', '/api/issues', readIssueFields(form));
    setFlash(message);
    location.href = 'issue.html?id=' + id;
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
