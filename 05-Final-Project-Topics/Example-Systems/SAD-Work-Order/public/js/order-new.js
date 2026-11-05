// UI-03 create a work order (FR-WO-01, 02)

const form = document.getElementById('order-form');

async function load() {
  const { products } = await api('GET', '/api/orders/new-form');
  document.getElementById('fields').innerHTML = orderFieldsHtml({}, products);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { id, message } = await api('POST', '/api/orders', readOrderFields(form));
    setFlash(message);
    location.href = 'order.html?id=' + id;
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ plannerOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
