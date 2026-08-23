const cfg = window.APP_CONFIG;
const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const state = {
  page: "home",
  calendarMonth: null
};

const navItems = [
  ["home", "Home"],
  ["tasks", "Tasks"],
  ["jobs", "Job Board"],
  ["applications", "Applications"],
  ["chemicals", "Chem Inventory"],
  ["calendar", "Calendar"],
  ["greens", "Greens"],
  ["equipment", "Equipment"],
  ["staff", "Staff"],
  ["notes", "Notes"]
];

document.addEventListener("DOMContentLoaded", init);

/* =====================================================
   STARTUP / LOGIN
   ===================================================== */

async function init() {
  renderNav();

  document
    .querySelector("#login-form")
    .addEventListener("submit", login);

  document
    .querySelector("#sign-out-button")
    .addEventListener("click", () => db.auth.signOut());

  const { data } = await db.auth.getSession();

  showForSession(data.session);

  db.auth.onAuthStateChange((_event, session) => {
    showForSession(session);
  });
}

async function login(event) {
  event.preventDefault();

  const email = document
    .querySelector("#login-email")
    .value
    .trim();

  const password = document
    .querySelector("#login-password")
    .value;

  const message = document.querySelector("#login-message");

  message.textContent = "";

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = error.message;
  }
}

function showForSession(session) {
  document
    .querySelector("#login-screen")
    .classList.toggle("hidden", !!session);

  document
    .querySelector("#app-shell")
    .classList.toggle("hidden", !session);

  if (session) {
    renderPage();
  }
}

/* =====================================================
   NAVIGATION
   ===================================================== */

function renderNav() {
  const nav = document.querySelector("#nav");

  nav.innerHTML = navItems
    .map(
      ([key, label]) => `
        <button
          data-page="${key}"
          class="${key === "home" ? "active" : ""}"
        >
          ${label}
        </button>
      `
    )
    .join("");

  nav.addEventListener("click", event => {
    const button = event.target.closest("button[data-page]");

    if (!button) return;

    state.page = button.dataset.page;

    [...nav.querySelectorAll("button")].forEach(item => {
      item.classList.toggle("active", item === button);
    });

    renderPage();
  });
}

async function renderPage() {
  const page = document.querySelector("#page");

  if (state.page === "home") {
    return renderHome(page);
  }

  if (state.page === "applications") {
    return renderApplications(page);
  }

  if (state.page === "chemicals") {
    return renderChemicalInventory(page);
  }

  if (state.page === "staff") {
    return renderStaff(page);
  }

  const spec = specs[state.page];

  if (spec) {
    return renderCrud(page, spec);
  }
}

/* =====================================================
   HOME
   ===================================================== */

async function renderHome(page) {
  if (!state.calendarMonth) {
    state.calendarMonth = new Date();
    state.calendarMonth.setDate(1);
  }

  const monthStart = new Date(
    state.calendarMonth.getFullYear(),
    state.calendarMonth.getMonth(),
    1
  );

  const monthEnd = new Date(
    state.calendarMonth.getFullYear(),
    state.calendarMonth.getMonth() + 1,
    0
  );

  const [
    tasks,
    equipment,
    notes,
    calendar,
    chemicals
  ] = await Promise.all([
    db
      .from("tasks")
      .select("*", {
        count: "exact",
        head: true
      })
      .neq("status", "done"),

    db
      .from("equipment")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("status", "down"),

    db
      .from("daily_notes")
      .select("*")
      .order("note_date", {
        ascending: false
      })
      .limit(3),

    db
      .from("calendar_entries")
      .select("*")
      .lte("start_date", formatDate(monthEnd))
      .or(
        `end_date.gte.${formatDate(monthStart)},end_date.is.null`
      )
      .order("start_date"),

    db
      .from("chemical_products")
      .select("*")
  ]);

  const lowProducts = (chemicals.data || []).filter(product => {
    if (product.reorder_level == null) {
      return false;
    }

    return (
      Number(product.quantity) <=
      Number(product.reorder_level)
    );
  });

  page.innerHTML = `
    <div class="heading">
      <h2>Home</h2>
    </div>

    <div class="grid">

      <div class="card">
        <div class="meta">Open Tasks</div>
        <h3>${tasks.count ?? 0}</h3>
      </div>

      <div class="card">
        <div class="meta">Equipment Down</div>
        <h3>${equipment.count ?? 0}</h3>
      </div>

      <div class="card">
        <div class="meta">Low Stock Products</div>
        <h3>${lowProducts.length}</h3>
      </div>

    </div>

    <div
      class="card"
      style="margin-top:24px;"
    >

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          margin-bottom:18px;
        "
      >

        <button
          id="calendar-prev"
          class="primary"
          type="button"
        >
          ‹
        </button>

        <h2
          style="
            margin:0;
            text-align:center;
            color:var(--navy);
          "
        >
          ${monthStart.toLocaleDateString("en-CA", {
            month: "long",
            year: "numeric"
          })}
        </h2>

        <button
          id="calendar-next"
          class="primary"
          type="button"
        >
          ›
        </button>

      </div>

      ${buildMonthCalendar(
        monthStart,
        calendar.data || []
      )}

    </div>

    <h3 style="margin-top:28px;">
      Recent Notes
    </h3>

    ${cards(
      notes.data,
      row => `
        <h3>${esc(row.note_date)}</h3>
        <p>${esc(row.note_text)}</p>
      `
    )}
  `;

  document
    .querySelector("#calendar-prev")
    .addEventListener("click", () => {
      state.calendarMonth = new Date(
        state.calendarMonth.getFullYear(),
        state.calendarMonth.getMonth() - 1,
        1
      );

      renderHome(page);
    });

  document
    .querySelector("#calendar-next")
    .addEventListener("click", () => {
      state.calendarMonth = new Date(
        state.calendarMonth.getFullYear(),
        state.calendarMonth.getMonth() + 1,
        1
      );

      renderHome(page);
    });
}

/* =====================================================
   MONTH CALENDAR
   ===================================================== */

function buildMonthCalendar(monthStart, events) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();

  const firstDay = new Date(
    year,
    month,
    1
  ).getDay();

  const daysInMonth = new Date(
    year,
    month + 1,
    0
  ).getDate();

  const previousMonthDays = new Date(
    year,
    month,
    0
  ).getDate();

  const todayDate = new Date();

  const dayNames = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat"
  ];

  let html = `
    <div
      style="
        display:grid;
        grid-template-columns:repeat(7,minmax(0,1fr));
        gap:4px;
      "
    >
  `;

  for (const dayName of dayNames) {
    html += `
      <div
        style="
          text-align:center;
          font-weight:800;
          padding:8px 2px;
          color:var(--navy);
          font-size:.82rem;
        "
      >
        ${dayName}
      </div>
    `;
  }

  for (let cell = 0; cell < 42; cell++) {
    let dayNumber;
    let cellDate;
    let otherMonth = false;

    if (cell < firstDay) {
      dayNumber =
        previousMonthDays -
        firstDay +
        cell +
        1;

      cellDate = new Date(
        year,
        month - 1,
        dayNumber
      );

      otherMonth = true;
    } else if (
      cell >=
      firstDay + daysInMonth
    ) {
      dayNumber =
        cell -
        firstDay -
        daysInMonth +
        1;

      cellDate = new Date(
        year,
        month + 1,
        dayNumber
      );

      otherMonth = true;
    } else {
      dayNumber =
        cell -
        firstDay +
        1;

      cellDate = new Date(
        year,
        month,
        dayNumber
      );
    }

    const dateString = formatDate(cellDate);

    const isToday =
      cellDate.getFullYear() === todayDate.getFullYear() &&
      cellDate.getMonth() === todayDate.getMonth() &&
      cellDate.getDate() === todayDate.getDate();

    const dayEvents = events.filter(event => {
      const start = event.start_date;
      const end =
        event.end_date ||
        event.start_date;

      return (
        dateString >= start &&
        dateString <= end
      );
    });

    html += `
      <div
        style="
          min-height:105px;
          min-width:0;
          border:1px solid var(--border);
          border-radius:8px;
          padding:6px;
          background:${
            otherMonth
              ? "#f7f7f7"
              : "#fff"
          };
          opacity:${
            otherMonth
              ? ".55"
              : "1"
          };
        "
      >

        <div
          style="
            display:flex;
            justify-content:flex-end;
            margin-bottom:5px;
          "
        >

          <span
            style="
              display:grid;
              place-items:center;
              width:28px;
              height:28px;
              border-radius:50%;
              font-weight:800;
              ${
                isToday
                  ? `
                    background:#006747;
                    color:#fff;
                  `
                  : ""
              }
            "
          >
            ${dayNumber}
          </span>

        </div>

        ${dayEvents
          .map(
            event => `
              <div
                style="
                  font-size:.72rem;
                  font-weight:700;
                  padding:4px 5px;
                  margin-bottom:4px;
                  border-radius:6px;
                  background:#e7f2ed;
                  color:#004B2B;
                  overflow:hidden;
                  word-break:break-word;
                "
              >
                ${esc(event.title)}
              </div>
            `
          )
          .join("")}

      </div>
    `;
  }

  html += `</div>`;

  return html;
}

/* =====================================================
   APPLICATIONS
   ===================================================== */

async function renderApplications(page) {
  const {
    data: products,
    error: productError
  } = await db
    .from("chemical_products")
.select(`
  id,
  product_name,
  quantity,
  unit
`)
.eq("active", true)
.order("product_name");

  if (productError) {
    page.innerHTML = `
      <div class="heading">
        <h2>Applications</h2>
      </div>

      <div class="empty">
        ${esc(productError.message)}
      </div>
    `;

    return;
  }

  page.innerHTML = `
    <div class="heading">

      <h2>Applications</h2>

      <button
        id="toggle-application-form"
        class="primary"
      >
        + New Application
      </button>

    </div>

    <form
      id="application-form"
      class="form hidden"
    >

      <div class="form-grid">

        <label>
          Date
          <input
            id="application_date"
            type="date"
            required
            value="${today()}"
          >
        </label>

        <label>
          Course
          <input
            id="application_course"
            type="text"
          >
        </label>

        <label>
          Area
          <input
            id="application_area"
            type="text"
          >
        </label>

        <label>
          Holes / Zone
          <input
            id="application_holes"
            type="text"
          >
        </label>

        <label>
          Applicator
          <input
            id="application_applicator"
            type="text"
          >
        </label>

        <label>
          Tank Count
          <input
            id="application_tank_count"
            type="number"
            min="0"
            step="any"
          >
        </label>

        <label>
          Temperature °C
          <input
            id="application_temperature"
            type="number"
            step="any"
          >
        </label>

        <label>
          Wind km/h
          <input
            id="application_wind"
            type="number"
            step="any"
          >
        </label>

      </div>

      <h3>Products</h3>

      <div
        id="application-product-rows"
      ></div>

      <button
        id="add-product-row"
        type="button"
        class="primary"
      >
        + Add Another Product
      </button>

      <label>
        Notes

        <textarea
          id="application_notes"
        ></textarea>
      </label>

      <button
        type="submit"
        class="primary"
      >
        Save Application
      </button>

      <p id="application-message"></p>

    </form>

    <section
      id="application-list"
      class="list"
    ></section>
  `;

  document
    .querySelector("#toggle-application-form")
    .addEventListener("click", () => {
      document
        .querySelector("#application-form")
        .classList
        .toggle("hidden");
    });

  const productRows =
    document.querySelector(
      "#application-product-rows"
    );

  function addProductRow() {
    const row =
      document.createElement("div");

    row.className = "card";
    row.style.marginBottom = "12px";

    row.innerHTML = `
      <div class="form-grid">

        <label>
          Product

          <select
            class="application-product-select"
            required
          >

            <option value="">
              Choose product…
            </option>

            ${products
              .map(
                product => `
                  <option
                    value="${product.id}"
                    data-stock="${
                      product.quantity ?? 0
                    }"
                    data-unit="${esc(
                      product.unit || ""
                    )}"
                  >
                    ${esc(product.product_name)}
                    —
                    ${esc(
                      String(
                        product.quantity ?? 0
                      )
                    )}
                    ${esc(product.unit || "")}
                    available
                  </option>
                `
              )
              .join("")}

          </select>
        </label>

        <label>
          Quantity Used

          <input
            class="application-product-quantity"
            type="number"
            min="0"
            step="any"
            required
          >
        </label>

      </div>

      <p
        class="meta application-product-help"
      >
        Select a product.
      </p>

      <button
        type="button"
        class="delete remove-product-row"
      >
        Remove Product
      </button>
    `;

    const select =
      row.querySelector(
        ".application-product-select"
      );

    const help =
      row.querySelector(
        ".application-product-help"
      );

    select.addEventListener("change", () => {
      const option =
        select.selectedOptions[0];

      if (!option?.value) {
        help.textContent =
          "Select a product.";

        return;
      }

      help.textContent =
        `${option.dataset.stock} ` +
        `${option.dataset.unit} ` +
        `currently in inventory`;
    });

    row
      .querySelector(".remove-product-row")
      .addEventListener("click", () => {
        if (
          productRows.children.length <= 1
        ) {
          return;
        }

        row.remove();
      });

    productRows.appendChild(row);
  }

  addProductRow();

  document
    .querySelector("#add-product-row")
    .addEventListener(
      "click",
      addProductRow
    );

  document
    .querySelector("#application-form")
    .addEventListener(
      "submit",
      event =>
        saveApplication(
          event,
          products
        )
    );

  await loadApplications();
}

async function saveApplication(
  event,
  products
) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#application-message"
    );

  message.textContent = "";

  const rows = [
    ...document.querySelectorAll(
      "#application-product-rows > .card"
    )
  ];

  if (!rows.length) {
    message.textContent =
      "Add at least one product.";

    return;
  }

  const selectedProducts = [];

  for (const row of rows) {
    const productId =
      row
        .querySelector(
          ".application-product-select"
        )
        .value;

    const quantity = Number(
      row
        .querySelector(
          ".application-product-quantity"
        )
        .value
    );

    if (
      !productId ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      message.textContent =
        "Each product needs a quantity greater than zero.";

      return;
    }

    if (
      selectedProducts.some(
        item =>
          item.product_id ===
          productId
      )
    ) {
      message.textContent =
        "The same product is listed more than once.";

      return;
    }

    const product =
      products.find(
        item =>
          item.id === productId
      );

    if (
      product &&
      Number(product.quantity) <
        quantity
    ) {
      message.textContent =
        `Not enough ${product.product_name}. ` +
        `Available: ${product.quantity} ` +
        `${product.unit || ""}.`;

      return;
    }

    selectedProducts.push({
      product_id: productId,
      quantity_used: quantity
    });
  }

  const payload = {
    application_date:
      document.querySelector(
        "#application_date"
      ).value,

    course:
      nullable(
        "application_course"
      ),

    area:
      nullable(
        "application_area"
      ),

    holes:
      nullable(
        "application_holes"
      ),

    applicator_name:
      nullable(
        "application_applicator"
      ),

    tank_count:
      nullableNumber(
        "application_tank_count"
      ),

    temperature_c:
      nullableNumber(
        "application_temperature"
      ),

    wind_kmh:
      nullableNumber(
        "application_wind"
      ),

    notes:
      nullable(
        "application_notes"
      )
  };

  const {
    data: application,
    error
  } = await db
    .from("applications")
    .insert(payload)
    .select()
    .single();

  if (error) {
    message.textContent =
      error.message;

    return;
  }

  for (
    const product of
    selectedProducts
  ) {
    const {
      error: productError
    } = await db
      .from("application_products")
      .insert({
        application_id:
          application.id,

        product_id:
          product.product_id,

        quantity_used:
          product.quantity_used
      });

    if (productError) {
      await db
        .from("application_products")
        .delete()
        .eq(
          "application_id",
          application.id
        );

      await db
        .from("applications")
        .delete()
        .eq(
          "id",
          application.id
        );

      message.textContent =
        productError.message;

      return;
    }
  }

  event.target.reset();

  document.querySelector(
    "#application_date"
  ).value = today();

  document
    .querySelector("#application-form")
    .classList
    .add("hidden");

  await loadApplications();
}

async function loadApplications() {
  const box =
    document.querySelector(
      "#application-list"
    );

  box.innerHTML = `
    <div class="empty">
      Loading applications…
    </div>
  `;

  const {
    data,
    error
  } = await db
    .from("applications")
    .select(`
      id,
      application_date,
      course,
      area,
      holes,
      applicator_name,
      tank_count,
      temperature_c,
      wind_kmh,
      notes,
      created_at,

      application_products (
        id,
        quantity_used,
        product_id,

        chemical_products (
          product_name,
          unit
        )
      )
    `)
    .order(
      "application_date",
      {
        ascending: false
      }
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    );

  if (error) {
    box.innerHTML = `
      <div class="empty">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  if (!data?.length) {
    box.innerHTML = `
      <div class="empty">
        No applications yet.
      </div>
    `;

    return;
  }

  box.innerHTML = data
    .map(application => {
      const products =
        application.application_products ||
        [];

      return `
        <article class="card row">

          <div>

            <h3>
              ${esc(
                application.application_date
              )}
            </h3>

            <p class="meta">
              ${esc(
                [
                  application.course,
                  application.area,
                  application.holes
                ]
                  .filter(Boolean)
                  .join(" · ")
              )}
            </p>

            <p>
              ${products
                .map(item => {
                  const chemical =
                    item.chemical_products;

                  return `
                    <span class="tag">
                      ${esc(
                        chemical?.product_name ||
                        "Product"
                      )}
                      —
                      ${esc(
                        String(
                          item.quantity_used
                        )
                      )}
                      ${esc(
                        chemical?.unit ||
                        ""
                      )}
                    </span>
                  `;
                })
                .join(" ")}
            </p>

            ${
              application.applicator_name
                ? `
                  <p>
                    Applicator:
                    ${esc(
                      application.applicator_name
                    )}
                  </p>
                `
                : ""
            }

            ${
              application.tank_count != null
                ? `
                  <p>
                    Tanks:
                    ${esc(
                      String(
                        application.tank_count
                      )
                    )}
                  </p>
                `
                : ""
            }

            ${
              application.temperature_c != null
                ? `
                  <p class="meta">
                    Temperature:
                    ${esc(
                      String(
                        application.temperature_c
                      )
                    )}°C
                  </p>
                `
                : ""
            }

            ${
              application.wind_kmh != null
                ? `
                  <p class="meta">
                    Wind:
                    ${esc(
                      String(
                        application.wind_kmh
                      )
                    )}
                    km/h
                  </p>
                `
                : ""
            }

            ${
              application.notes
                ? `
                  <p>
                    ${esc(
                      application.notes
                    )}
                  </p>
                `
                : ""
            }

          </div>

          <button
            class="delete delete-application"
            data-id="${application.id}"
          >
            Delete
          </button>

        </article>
      `;
    })
    .join("");

  box
    .querySelectorAll(
      ".delete-application"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        async () => {
          const appId =
            button.dataset.id;

          if (
            !confirm(
              "Delete this application? The products will be returned to inventory."
            )
          ) {
            return;
          }

          const {
            error: productDeleteError
          } = await db
            .from("application_products")
            .delete()
            .eq(
              "application_id",
              appId
            );

          if (productDeleteError) {
            alert(
              productDeleteError.message
            );

            return;
          }

          const {
            error: applicationDeleteError
          } = await db
            .from("applications")
            .delete()
            .eq(
              "id",
              appId
            );

          if (applicationDeleteError) {
            alert(
              applicationDeleteError.message
            );

            return;
          }

          await loadApplications();
        }
      );
    });
}

/* =====================================================
   CHEMICAL INVENTORY
   ===================================================== */

async function renderChemicalInventory(page) {
  const {
    data: products,
    error
  } = await db
    .from("chemical_products")
.select("*")
.eq("active", true)
.order("product_name");

  if (error) {
    page.innerHTML = `
      <div class="heading">
        <h2>
          Chemical Inventory
        </h2>
      </div>

      <div class="empty">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  page.innerHTML = `
    <div class="heading">
      <h2>
        Chemical Inventory
      </h2>
    </div>

    <div
      style="
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        margin-bottom:20px;
      "
    >

      <button
        id="show-add-product"
        class="primary"
      >
        + Add Product
      </button>

      <button
        id="show-receive-stock"
        class="primary"
      >
        + Receive Inventory
      </button>

      <button
        id="show-adjust-stock"
        class="primary"
      >
        Adjust Inventory
      </button>

    </div>

    ${addChemicalForm()}

    ${receiveInventoryForm(products)}

    ${adjustInventoryForm(products)}

    <section
      id="chemical-list"
      class="list"
    ></section>

    <h3 style="margin-top:28px;">
      Recent Inventory Activity
    </h3>

    <section
      id="inventory-history"
      class="list"
    ></section>
  `;

  document
    .querySelector("#show-add-product")
    .addEventListener("click", () => {
      hideInventoryForms();

      document
        .querySelector("#add-product-form")
        .classList
        .remove("hidden");
    });

  document
    .querySelector("#show-receive-stock")
    .addEventListener("click", () => {
      hideInventoryForms();

      document
        .querySelector("#receive-stock-form")
        .classList
        .remove("hidden");
    });

  document
    .querySelector("#show-adjust-stock")
    .addEventListener("click", () => {
      hideInventoryForms();

      document
        .querySelector("#adjust-stock-form")
        .classList
        .remove("hidden");
    });

  document
    .querySelector("#add-product-form")
    .addEventListener(
      "submit",
      saveNewChemical
    );

  document
    .querySelector("#receive-stock-form")
    .addEventListener(
      "submit",
      receiveInventory
    );

  document
    .querySelector("#adjust-stock-form")
    .addEventListener(
      "submit",
      adjustInventory
    );

  renderChemicalCards(products);

  await loadInventoryHistory();
}

function hideInventoryForms() {
  [
    "#add-product-form",
    "#receive-stock-form",
    "#adjust-stock-form"
  ].forEach(selector => {
    document
      .querySelector(selector)
      ?.classList
      .add("hidden");
  });
}

function addChemicalForm() {
  return `
    <form
      id="add-product-form"
      class="form hidden"
    >

      <h3>
        Add Chemical Product
      </h3>

      <div class="form-grid">

        <label>
          Product Name
          <input
            id="new_product_name"
            required
          >
        </label>

        <label>
          Product Type

          <select id="new_product_type">

            <option value="fungicide">
              Fungicide
            </option>

            <option value="herbicide">
              Herbicide
            </option>

            <option value="insecticide">
              Insecticide
            </option>

            <option value="fertilizer">
              Fertilizer
            </option>

            <option value="wetting_agent">
              Wetting Agent
            </option>

            <option value="growth_regulator">
              Growth Regulator
            </option>

            <option value="other">
              Other
            </option>

          </select>

        </label>

        <label>
          Manufacturer
          <input
            id="new_manufacturer"
          >
        </label>

        <label>
          Unit

          <select id="new_unit">

         <option value="L">
    Litres
  </option>

  <option value="mL">
    Millilitres
  </option>

  <option value="kg">
    Kilograms
  </option>

  <option value="g">
    Grams
  </option>

  <option value="bags">
    Bags
  </option>

  <option value="jugs">
    Jugs
  </option>

</select>

        </label>

        <label>
          Storage Location
          <input
            id="new_storage_location"
          >
        </label>

        <label>
          Low Stock Level
          <input
            id="new_reorder_level"
            type="number"
            min="0"
            step="any"
          >
        </label>

      </div>

      <p class="meta">
        New products start at 0 inventory.
      </p>

      <button
        type="submit"
        class="primary"
      >
        Add Product
      </button>

      <p id="add-product-message"></p>

    </form>
  `;
}

async function saveNewChemical(event) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#add-product-message"
    );

  message.textContent = "";

  const payload = {
    product_name:
      document
        .querySelector("#new_product_name")
        .value
        .trim(),

    product_type:
      nullable("new_product_type"),

    manufacturer:
      nullable("new_manufacturer"),

    quantity: 0,

    unit:
      document
        .querySelector("#new_unit")
        .value,

    storage_location:
      nullable(
        "new_storage_location"
      ),

    reorder_level:
      nullableNumber(
        "new_reorder_level"
      )
  };

  const { error } = await db
    .from("chemical_products")
    .insert(payload);

  if (error) {
    message.textContent =
      error.message;

    return;
  }

  await renderChemicalInventory(
    document.querySelector("#page")
  );
}

function receiveInventoryForm(products) {
  return `
    <form
      id="receive-stock-form"
      class="form hidden"
    >

      <h3>
        Receive Inventory
      </h3>

      <div class="form-grid">

        <label>
          Product

          <select
            id="receive_product_id"
            required
          >

            <option value="">
              Choose product…
            </option>

            ${productOptions(products)}

          </select>
        </label>

        <label>
          Quantity Received

          <input
            id="receive_quantity"
            type="number"
            min="0"
            step="any"
            required
          >
        </label>

        <label>
          Date Received

          <input
            id="receive_date"
            type="date"
            required
            value="${today()}"
          >
        </label>

        <label>
          Supplier

          <input
            id="receive_supplier"
          >
        </label>

      </div>

      <label>
        Notes

        <textarea
          id="receive_notes"
        ></textarea>
      </label>

      <button
        type="submit"
        class="primary"
      >
        Receive Inventory
      </button>

      <p id="receive-message"></p>

    </form>
  `;
}

async function receiveInventory(event) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#receive-message"
    );

  message.textContent = "";

  const quantity = Number(
    document
      .querySelector("#receive_quantity")
      .value
  );

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    message.textContent =
      "Quantity must be greater than zero.";

    return;
  }

  const payload = {
    product_id:
      document
        .querySelector("#receive_product_id")
        .value,

    transaction_type:
      "delivery",

    quantity_change:
      quantity,

    transaction_date:
      document
        .querySelector("#receive_date")
        .value,

    supplier:
      nullable("receive_supplier"),

    reason:
      "Inventory received",

    notes:
      nullable("receive_notes")
  };

  const { error } = await db
    .from("inventory_transactions")
    .insert(payload);

  if (error) {
    message.textContent =
      error.message;

    return;
  }

  await renderChemicalInventory(
    document.querySelector("#page")
  );
}

function adjustInventoryForm(products) {
  return `
    <form
      id="adjust-stock-form"
      class="form hidden"
    >

      <h3>
        Adjust Inventory
      </h3>

      <p class="meta">
        Positive number adds inventory.
        Negative number removes inventory.
      </p>

      <div class="form-grid">

        <label>
          Product

          <select
            id="adjust_product_id"
            required
          >

            <option value="">
              Choose product…
            </option>

            ${productOptions(products)}

          </select>
        </label>

        <label>
          Adjustment

          <input
            id="adjust_quantity"
            type="number"
            step="any"
            required
            placeholder="-2 or 4"
          >
        </label>

        <label>
          Date

          <input
            id="adjust_date"
            type="date"
            required
            value="${today()}"
          >
        </label>

        <label>
          Reason

          <select id="adjust_reason">

            <option value="Physical count correction">
              Physical count correction
            </option>

            <option value="Spill / waste">
              Spill / waste
            </option>

            <option value="Damaged container">
              Damaged container
            </option>

            <option value="Returned product">
              Returned product
            </option>

            <option value="Transfer">
              Transfer
            </option>

            <option value="Other">
              Other
            </option>

          </select>

        </label>

      </div>

      <label>
        Notes

        <textarea
          id="adjust_notes"
        ></textarea>
      </label>

      <button
        type="submit"
        class="primary"
      >
        Save Adjustment
      </button>

      <p id="adjust-message"></p>

    </form>
  `;
}

async function adjustInventory(event) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#adjust-message"
    );

  message.textContent = "";

  const quantity = Number(
    document
      .querySelector("#adjust_quantity")
      .value
  );

  if (
    !Number.isFinite(quantity) ||
    quantity === 0
  ) {
    message.textContent =
      "Adjustment cannot be zero.";

    return;
  }

  const payload = {
    product_id:
      document
        .querySelector("#adjust_product_id")
        .value,

    transaction_type:
      "adjustment",

    quantity_change:
      quantity,

    transaction_date:
      document
        .querySelector("#adjust_date")
        .value,

    reason:
      document
        .querySelector("#adjust_reason")
        .value,

    notes:
      nullable("adjust_notes")
  };

  const { error } = await db
    .from("inventory_transactions")
    .insert(payload);

  if (error) {
    message.textContent =
      error.message;

    return;
  }

  await renderChemicalInventory(
    document.querySelector("#page")
  );
}

function renderChemicalCards(products) {
  const box =
    document.querySelector(
      "#chemical-list"
    );

  if (!products?.length) {
    box.innerHTML = `
      <div class="empty">
        No chemicals in inventory.
      </div>
    `;

    return;
  }

  box.innerHTML = products
    .map(product => {
      const low =
        product.reorder_level != null &&
        Number(product.quantity) <=
        Number(product.reorder_level);

      return `
        <article class="card row">

          <div>

            <h3>
              ${esc(product.product_name)}
            </h3>

            <p>
              <span class="tag">
                ${esc(
                  String(
                    product.quantity ?? 0
                  )
                )}
                ${esc(product.unit || "")}
              </span>

              ${
                low
                  ? `
                    <span class="tag">
                      LOW STOCK
                    </span>
                  `
                  : ""
              }
            </p>

            <p class="meta">
              ${esc(
                [
                  product.product_type,
                  product.manufacturer,
                  product.storage_location
                ]
                  .filter(Boolean)
                  .join(" · ")
              )}
            </p>

          </div>

          <button
            class="delete remove-chemical"
            data-id="${product.id}"
            type="button"
          >
            Delete
          </button>

        </article>
      `;
    })
    .join("");

  box
    .querySelectorAll(
      ".remove-chemical"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        async () => {
          const confirmed =
            confirm(
              "Remove this product from current inventory? Old application records will be kept."
            );

          if (!confirmed) {
            return;
          }

          const { error } =
            await db
              .from("chemical_products")
              .update({
                active: false
              })
              .eq(
                "id",
                button.dataset.id
              );

          if (error) {
            alert(error.message);
            return;
          }

          await renderChemicalInventory(
            document.querySelector("#page")
          );
        }
      );
    });
}

async function loadInventoryHistory() {
  const box =
    document.querySelector(
      "#inventory-history"
    );

  box.innerHTML = `
    <div class="empty">
      Loading inventory activity…
    </div>
  `;

  const {
    data,
    error
  } = await db
    .from("inventory_transactions")
    .select(`
      id,
      transaction_type,
      quantity_change,
      transaction_date,
      supplier,
      reason,
      notes,
      created_at,

      chemical_products (
        product_name,
        unit
      )
    `)
    .order(
      "transaction_date",
      {
        ascending: false
      }
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(50);

  if (error) {
    box.innerHTML = `
      <div class="empty">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  if (!data?.length) {
    box.innerHTML = `
      <div class="empty">
        No inventory activity yet.
      </div>
    `;

    return;
  }

  box.innerHTML = data
    .map(transaction => {
      const product =
        transaction.chemical_products;

      const change =
        Number(
          transaction.quantity_change
        );

      return `
        <article class="card">

          <h3>
            ${esc(
              product?.product_name ||
              "Product"
            )}
          </h3>

          <p>
            <span class="tag">
              ${change > 0 ? "+" : ""}
              ${esc(String(change))}
              ${esc(product?.unit || "")}
            </span>
          </p>

          <p class="meta">
            ${esc(
              transaction.transaction_date
            )}
            ·
            ${esc(
              humanize(
                transaction.transaction_type
              )
            )}
          </p>

          ${
            transaction.supplier
              ? `
                <p>
                  Supplier:
                  ${esc(
                    transaction.supplier
                  )}
                </p>
              `
              : ""
          }

          ${
            transaction.reason
              ? `
                <p>
                  ${esc(
                    transaction.reason
                  )}
                </p>
              `
              : ""
          }

          ${
            transaction.notes
              ? `
                <p class="meta">
                  ${esc(
                    transaction.notes
                  )}
                </p>
              `
              : ""
          }

        </article>
      `;
    })
    .join("");
}

function productOptions(products) {
  return products
    .map(
      product => `
        <option value="${product.id}">
          ${esc(product.product_name)}
          —
          ${esc(
            String(
              product.quantity ?? 0
            )
          )}
          ${esc(product.unit || "")}
        </option>
      `
    )
    .join("");
}

/* =====================================================
   STANDARD PAGES
   ===================================================== */

const specs = {
  tasks: {
    title: "Tasks",
    table: "tasks",
    order: "created_at",

    fields: [
      ["title", "Title", "text"],
      ["course", "Course", "text"],
      ["area", "Area", "text"],
      ["assigned_to", "Assigned To", "text"],

      [
        "priority",
        "Priority",
        "select",
        [
          ["low", "Low"],
          ["medium", "Medium"],
          ["high", "High"],
          ["urgent", "Urgent"]
        ]
      ],

      [
        "status",
        "Status",
        "select",
        [
          ["open", "Open"],
          ["in_progress", "In Progress"],
          ["done", "Done"]
        ]
      ],

      ["due_date", "Due Date", "date"],
      ["description", "Description", "textarea"]
    ],

    display: row => `
      <h3>${esc(row.title)}</h3>

      <p class="meta">
        ${esc(
          [
            row.course,
            row.area,
            row.assigned_to
          ]
            .filter(Boolean)
            .join(" · ")
        )}
      </p>

      ${
        row.description
          ? `<p>${esc(row.description)}</p>`
          : ""
      }

      <p>
        <span class="tag">
          ${esc(
            humanize(
              row.priority ||
              "medium"
            )
          )}
        </span>

        <span class="tag">
          ${esc(
            humanize(
              row.status ||
              "open"
            )
          )}
        </span>
      </p>
    `
  },

  jobs: {
    title: "Job Board",
    table: "jobs",
    order: "created_at",

    fields: [
      ["title", "Title", "text"],
      ["job_type", "Job Type", "text"],
      ["course", "Course", "text"],
      ["area", "Area", "text"],
      ["assigned_to", "Assigned To", "text"],

      [
        "priority",
        "Priority",
        "select",
        [
          ["low", "Low"],
          ["medium", "Medium"],
          ["high", "High"],
          ["urgent", "Urgent"]
        ]
      ],

      [
        "status",
        "Status",
        "select",
        [
          ["open", "Open"],
          ["in_progress", "In Progress"],
          ["done", "Done"]
        ]
      ],

      ["due_date", "Due Date", "date"],
      ["description", "Description", "textarea"]
    ],

    display: row => `
      <h3>${esc(row.title)}</h3>

      <p class="meta">
        ${esc(
          [
            row.job_type,
            row.course,
            row.area,
            row.assigned_to
          ]
            .filter(Boolean)
            .join(" · ")
        )}
      </p>

      ${
        row.description
          ? `<p>${esc(row.description)}</p>`
          : ""
      }

      <p>
        <span class="tag">
          ${esc(
            humanize(
              row.status ||
              "open"
            )
          )}
        </span>
      </p>
    `
  },

  calendar: {
    title: "Calendar",
    table: "calendar_entries",
    order: "start_date",

    fields: [
      ["title", "Title", "text"],

      [
        "entry_type",
        "Entry Type",
        "select",
        [
          ["event", "Event"],
          ["staff_day_off", "Staff Day Off"],
          ["maintenance", "Maintenance"],
          ["tournament", "Tournament"],
          ["delivery", "Delivery"],
          ["other", "Other"]
        ]
      ],

      ["start_date", "Start Date", "date"],
      ["end_date", "End Date", "date"],
      ["staff_member", "Staff Member", "text"],
      ["description", "Description", "textarea"]
    ],

    display: row => `
      <h3>${esc(row.title)}</h3>

      <p class="meta">
        ${esc(row.start_date)}

        ${
          row.end_date
            ? ` – ${esc(row.end_date)}`
            : ""
        }

        ·
        ${esc(
          humanize(
            row.entry_type ||
            "event"
          )
        )}
      </p>

      ${
        row.staff_member
          ? `
            <p>
              Staff:
              ${esc(row.staff_member)}
            </p>
          `
          : ""
      }

      ${
        row.description
          ? `<p>${esc(row.description)}</p>`
          : ""
      }
    `
  },

  greens: {
    title: "Greens",
    table: "greens_logs",
    order: "reading_date",

    fields: [
      ["reading_date", "Date", "date"],
      ["course", "Course", "text"],
      ["green_name", "Green", "text"],
      ["moisture", "Moisture", "number"],
      ["firmness", "Firmness", "number"],
      ["green_speed", "Green Speed", "number"],
      ["mowing_height_mm", "Mowing Height mm", "number"],
      ["soil_temperature_c", "Soil Temperature °C", "number"],
      ["air_temperature_c", "Air Temperature °C", "number"],
      ["notes", "Notes", "textarea"]
    ],

    display: row => `
      <h3>${esc(row.green_name)}</h3>

      <p class="meta">
        ${esc(row.reading_date)}
        ${
          row.course
            ? ` · ${esc(row.course)}`
            : ""
        }
      </p>

      <p>
        Moisture:
        ${esc(
          String(
            row.moisture ?? "—"
          )
        )}
      </p>

      <p>
        Firmness:
        ${esc(
          String(
            row.firmness ?? "—"
          )
        )}
      </p>

      <p>
        Green Speed:
        ${esc(
          String(
            row.green_speed ?? "—"
          )
        )}
      </p>

      ${
        row.notes
          ? `<p>${esc(row.notes)}</p>`
          : ""
      }
    `
  },

  equipment: {
    title: "Equipment",
    table: "equipment",
    order: "equipment_name",

    fields: [
      ["equipment_name", "Equipment Name", "text"],
      ["manufacturer", "Manufacturer", "text"],
      ["model", "Model", "text"],
      ["fleet_number", "Fleet Number", "text"],
      ["serial_number", "Serial Number", "text"],

      [
        "status",
        "Status",
        "select",
        [
          ["operational", "Operational"],
          ["needs_repair", "Needs Repair"],
          ["down", "Down"]
        ]
      ],

      ["hours", "Hours", "number"],
      ["next_service_date", "Next Service Date", "date"],
      ["notes", "Notes", "textarea"]
    ],

    display: row => `
      <h3>
        ${esc(row.equipment_name)}
      </h3>

      <p class="meta">
        ${esc(
          [
            row.manufacturer,
            row.model,
            row.fleet_number
              ? `Fleet #${row.fleet_number}`
              : null
          ]
            .filter(Boolean)
            .join(" · ")
        )}
      </p>

      <p>
        <span class="tag">
          ${esc(
            humanize(
              row.status ||
              "operational"
            )
          )}
        </span>
      </p>

      ${
        row.hours != null
          ? `
            <p>
              Hours:
              ${esc(String(row.hours))}
            </p>
          `
          : ""
      }

      ${
        row.next_service_date
          ? `
            <p>
              Next Service:
              ${esc(
                row.next_service_date
              )}
            </p>
          `
          : ""
      }

      ${
        row.notes
          ? `<p>${esc(row.notes)}</p>`
          : ""
      }
    `
  },

  notes: {
    title: "Notes",
    table: "daily_notes",
    order: "note_date",

    fields: [
      ["note_date", "Date", "date"],
      ["category", "Category", "text"],
      ["note_text", "Note", "textarea"]
    ],

    display: row => `
      <h3>
        ${esc(row.note_date)}

        ${
          row.category
            ? `
              <span class="tag">
                ${esc(row.category)}
              </span>
            `
            : ""
        }
      </h3>

      <p>${esc(row.note_text)}</p>
    `
  }
};

/* =====================================================
   GENERIC CRUD WITH EDITING
   ===================================================== */

async function renderCrud(page, spec) {
  let editingId = null;

  page.innerHTML = `
    <div class="heading">

      <h2>${spec.title}</h2>

      <button
        id="toggle-form"
        class="primary"
      >
        + Add
      </button>

    </div>

    <form
      id="record-form"
      class="form hidden"
    >

      <div class="form-grid">

        ${spec.fields
          .filter(
            field =>
              field[2] !==
              "textarea"
          )
          .map(fieldHtml)
          .join("")}

      </div>

      ${spec.fields
        .filter(
          field =>
            field[2] ===
            "textarea"
        )
        .map(fieldHtml)
        .join("")}

      <div
        style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
        "
      >

        <button
          id="record-save-button"
          class="primary"
          type="submit"
        >
          Save
        </button>

        <button
          id="record-cancel-button"
          type="button"
          class="hidden"
        >
          Cancel Edit
        </button>

      </div>

      <p id="form-message"></p>

    </form>

    <section
      id="records"
      class="list"
    ></section>
  `;

  const form =
    document.querySelector(
      "#record-form"
    );

  const toggleButton =
    document.querySelector(
      "#toggle-form"
    );

  const saveButton =
    document.querySelector(
      "#record-save-button"
    );

  const cancelButton =
    document.querySelector(
      "#record-cancel-button"
    );

  const message =
    document.querySelector(
      "#form-message"
    );

  function resetForm() {
    editingId = null;

    form.reset();

    form.classList.add(
      "hidden"
    );

    saveButton.textContent =
      "Save";

    cancelButton.classList.add(
      "hidden"
    );

    toggleButton.textContent =
      "+ Add";

    message.textContent =
      "";
  }

  toggleButton.addEventListener(
    "click",
    () => {
      if (editingId) {
        resetForm();
      }

      form.classList.toggle(
        "hidden"
      );
    }
  );

  cancelButton.addEventListener(
    "click",
    resetForm
  );

  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      message.textContent =
        "";

      const payload = {};

      for (
        const [
          key,
          ,
          type
        ] of
        spec.fields
      ) {
        const element =
          document.getElementById(
            key
          );

        let value =
          element.value.trim();

        if (value === "") {
          value = null;
        }

        if (
          type === "number" &&
          value !== null
        ) {
          value = Number(value);
        }

        payload[key] = value;
      }

      let result;

      if (editingId) {
        result = await db
          .from(spec.table)
          .update(payload)
          .eq(
            "id",
            editingId
          );
      } else {
        result = await db
          .from(spec.table)
          .insert(payload);
      }

      if (result.error) {
        message.textContent =
          result.error.message;

        return;
      }

      resetForm();

      await loadRecords(
        spec,
        beginEdit
      );
    }
  );

  function beginEdit(row) {
    editingId = row.id;

    for (
      const [
        key,
        ,
        type
      ] of
      spec.fields
    ) {
      const element =
        document.getElementById(
          key
        );

      if (!element) {
        continue;
      }

      const value =
        row[key];

      if (
        value === null ||
        value === undefined
      ) {
        element.value = "";
      } else {
        element.value =
          String(value);
      }
    }

    form.classList.remove(
      "hidden"
    );

    saveButton.textContent =
      "Save Changes";

    cancelButton.classList.remove(
      "hidden"
    );

    toggleButton.textContent =
      "+ Add";

    message.textContent =
      "Editing existing record";

    form.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  await loadRecords(
    spec,
    beginEdit
  );
}

/* =====================================================
   LOAD RECORDS WITH EDIT + DELETE
   ===================================================== */

async function loadRecords(
  spec,
  onEdit
) {
  const box =
    document.querySelector(
      "#records"
    );

  box.innerHTML = `
    <div class="empty">
      Loading…
    </div>
  `;

  const {
    data,
    error
  } = await db
    .from(spec.table)
    .select("*")
    .order(
      spec.order,
      {
        ascending: false
      }
    );

  if (error) {
    box.innerHTML = `
      <div class="empty">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  if (!data?.length) {
    box.innerHTML = `
      <div class="empty">
        No records yet.
      </div>
    `;

    return;
  }

  box.innerHTML = data
    .map(
      row => `
        <article class="card row">

          <div>
            ${spec.display(row)}
          </div>

          <div
            style="
              display:flex;
              gap:8px;
              flex-wrap:wrap;
            "
          >

            <button
              class="primary edit-record"
              data-id="${row.id}"
              type="button"
            >
              Edit
            </button>

            <button
              class="delete delete-record"
              data-id="${row.id}"
              type="button"
            >
              Delete
            </button>

          </div>

        </article>
      `
    )
    .join("");

  box
    .querySelectorAll(
      ".edit-record"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const row =
            data.find(
              item =>
                String(item.id) ===
                String(
                  button.dataset.id
                )
            );

          if (row && onEdit) {
            onEdit(row);
          }
        }
      );
    });

  box
    .querySelectorAll(
      ".delete-record"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        async () => {
          if (
            !confirm(
              "Delete this record?"
            )
          ) {
            return;
          }

          const { error } =
            await db
              .from(spec.table)
              .delete()
              .eq(
                "id",
                button.dataset.id
              );

          if (error) {
            alert(error.message);

            return;
          }

          await loadRecords(
            spec,
            onEdit
          );
        }
      );
    });
}

/* =====================================================
   STAFF
   ===================================================== */

async function renderStaff(page) {
  page.innerHTML = `
    <div class="heading">
      <h2>Staff</h2>
    </div>

    <section
      id="staff-list"
      class="list"
    ></section>
  `;

  const {
    data,
    error
  } = await db
    .from("profiles")
    .select("*")
    .order("full_name");

  const box =
    document.querySelector(
      "#staff-list"
    );

  if (error) {
    box.innerHTML = `
      <div class="empty">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  if (!data?.length) {
    box.innerHTML = `
      <div class="empty">
        No staff found.
      </div>
    `;

    return;
  }

  box.innerHTML = data
    .map(
      row => `
        <article class="card">

          <h3>
            ${esc(
              row.full_name ||
              row.email ||
              "Staff"
            )}
          </h3>

          <p>
            <span class="tag">
              ${esc(
                row.position ||
                humanize(
                  row.role ||
                  "crew"
                )
              )}
            </span>
          </p>

          <p class="meta">
            ${esc(
              [
                row.phone,
                row.email
              ]
                .filter(Boolean)
                .join(" · ")
            )}
          </p>

        </article>
      `
    )
    .join("");
}

/* =====================================================
   FIELD RENDERER
   ===================================================== */

function fieldHtml(
  [
    key,
    label,
    type,
    options
  ]
) {
  if (type === "textarea") {
    return `
      <label>
        ${label}

        <textarea
          id="${key}"
        ></textarea>
      </label>
    `;
  }

  if (type === "select") {
    return `
      <label>
        ${label}

        <select id="${key}">

          ${options
            .map(
              ([
                optionValue,
                optionText
              ]) => `
                <option
                  value="${optionValue}"
                >
                  ${optionText}
                </option>
              `
            )
            .join("")}

        </select>
      </label>
    `;
  }

  return `
    <label>
      ${label}

      <input
        id="${key}"
        type="${type}"
        ${
          type === "number"
            ? 'step="any"'
            : ""
        }
      >
    </label>
  `;
}

/* =====================================================
   HELPERS
   ===================================================== */

function cards(
  rows,
  renderer
) {
  if (!rows?.length) {
    return `
      <div class="empty">
        Nothing to show.
      </div>
    `;
  }

  return `
    <div class="list">

      ${rows
        .map(
          row => `
            <article class="card">
              ${renderer(row)}
            </article>
          `
        )
        .join("")}

    </div>
  `;
}

function nullable(id) {
  const element =
    document.querySelector(
      `#${id}`
    );

  if (!element) {
    return null;
  }

  const value =
    element.value.trim();

  return value === ""
    ? null
    : value;
}

function nullableNumber(id) {
  const element =
    document.querySelector(
      `#${id}`
    );

  if (!element) {
    return null;
  }

  const value =
    element.value.trim();

  if (value === "") {
    return null;
  }

  return Number(value);
}

function today() {
  return formatDate(
    new Date()
  );
}

function formatDate(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

function humanize(value) {
  return String(
    value || ""
  )
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase()
    );
}

function esc(value) {
  const div =
    document.createElement(
      "div"
    );

  div.textContent =
    value ?? "";

  return div.innerHTML;
}
