const cfg = window.APP_CONFIG;
const db = supabase.createClient(
  cfg.SUPABASE_URL,
  cfg.SUPABASE_ANON_KEY
);

const state = {
  page: "home"
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
    const button = event.target.closest(
      "button[data-page]"
    );

    if (!button) return;

    state.page = button.dataset.page;

    [...nav.querySelectorAll("button")].forEach(item => {
      item.classList.toggle(
        "active",
        item === button
      );
    });

    renderPage();
  });
}

async function renderPage() {
  const page = document.querySelector("#page");

  if (state.page === "home") {
    return renderHome(page);
  }

  if (state.page === "staff") {
    return renderStaff(page);
  }

  if (state.page === "applications") {
    return renderApplications(page);
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
  const [
    tasks,
    equipment,
    notes,
    calendar
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
      .gte(
        "start_date",
        new Date()
          .toISOString()
          .slice(0, 10)
      )
      .order("start_date")
      .limit(3)
  ]);

  page.innerHTML = `
    <div class="heading">
      <h2>Home</h2>
    </div>

    <div class="grid">
      <div class="card">
        <div class="meta">
          Open tasks
        </div>

        <h3>
          ${tasks.count ?? 0}
        </h3>
      </div>

      <div class="card">
        <div class="meta">
          Equipment down
        </div>

        <h3>
          ${equipment.count ?? 0}
        </h3>
      </div>

      <div class="card">
        <div class="meta">
          Upcoming events
        </div>

        <h3>
          ${calendar.data?.length ?? 0}
        </h3>
      </div>
    </div>

    <h3>
      Recent notes
    </h3>

    ${cards(
      notes.data,
      row => `
        <h3>
          ${esc(row.note_date)}
        </h3>

        <p>
          ${esc(row.note_text)}
        </p>
      `
    )}

    <h3>
      Upcoming
    </h3>

    ${cards(
      calendar.data,
      row => `
        <h3>
          ${esc(row.title)}
        </h3>

        <p class="meta">
          ${esc(row.start_date)}
          ·
          ${esc(
            row.entry_type || "event"
          )}
        </p>
      `
    )}
  `;
}

/* =====================================================
   MULTI-PRODUCT APPLICATIONS
   ===================================================== */

async function renderApplications(page) {
  const {
    data: products,
    error: productError
  } = await db
    .from("chemical_products")
    .select(
      "id, product_name, quantity, unit"
    )
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
      <h2>
        Applications
      </h2>

      <button
        id="toggle-application-form"
        class="primary"
      >
        + New application
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
            value="${new Date()
              .toISOString()
              .slice(0, 10)}"
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
          Holes / zone

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
          Tank count

          <input
            id="application_tank_count"
            type="number"
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

      <h3>
        Products
      </h3>

      <div
        id="application-product-rows"
      ></div>

      <button
        id="add-product-row"
        type="button"
        class="primary"
      >
        + Add another product
      </button>

      <label>
        Notes

        <textarea
          id="application_notes"
        ></textarea>
      </label>

      <button
        class="primary"
        type="submit"
      >
        Save application
      </button>

      <p id="application-message"></p>
    </form>

    <section
      id="application-list"
      class="list"
    ></section>
  `;

  document
    .querySelector(
      "#toggle-application-form"
    )
    .addEventListener(
      "click",
      () => {
        document
          .querySelector(
            "#application-form"
          )
          .classList
          .toggle("hidden");
      }
    );

  const productRows =
    document.querySelector(
      "#application-product-rows"
    );

  function addProductRow() {
    const row =
      document.createElement("div");

    row.className = "card";

    row.style.marginBottom =
      "12px";

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
                    data-unit="${esc(
                      product.unit || ""
                    )}"
                    data-stock="${
                      product.quantity ?? 0
                    }"
                  >
                    ${esc(
                      product.product_name
                    )}
                    —
                    ${esc(
                      String(
                        product.quantity ?? 0
                      )
                    )}
                    ${esc(
                      product.unit || ""
                    )}
                    in stock
                  </option>
                `
              )
              .join("")}

          </select>
        </label>

        <label>
          Quantity used

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
        Select a product to see
        its unit and available stock.
      </p>

      <button
        type="button"
        class="delete remove-product-row"
      >
        Remove product
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

    select.addEventListener(
      "change",
      () => {
        const option =
          select.selectedOptions[0];

        if (!option?.value) {
          help.textContent =
            "Select a product to see its unit and available stock.";

          return;
        }

        help.textContent =
          `${option.dataset.stock} ` +
          `${option.dataset.unit} ` +
          `currently in inventory`;
      }
    );

    row
      .querySelector(
        ".remove-product-row"
      )
      .addEventListener(
        "click",
        () => {
          if (
            productRows.children.length === 1
          ) {
            return;
          }

          row.remove();
        }
      );

    productRows.appendChild(row);
  }

  addProductRow();

  document
    .querySelector(
      "#add-product-row"
    )
    .addEventListener(
      "click",
      addProductRow
    );

  document
    .querySelector(
      "#application-form"
    )
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

  const productRows = [
    ...document.querySelectorAll(
      "#application-product-rows > .card"
    )
  ];

  if (!productRows.length) {
    message.textContent =
      "Add at least one product.";

    return;
  }

  const selectedProducts = [];

  for (const row of productRows) {
    const productId =
      row.querySelector(
        ".application-product-select"
      ).value;

    const quantity =
      Number(
        row.querySelector(
          ".application-product-quantity"
        ).value
      );

    if (
      !productId ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      message.textContent =
        "Each product needs a valid quantity greater than zero.";

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
        "The same product is listed more than once. Combine it into one quantity.";

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

  const applicationPayload = {
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
    error: applicationError
  } = await db
    .from("applications")
    .insert(applicationPayload)
    .select()
    .single();

  if (applicationError) {
    message.textContent =
      applicationError.message;

    return;
  }

  for (
    const product of
    selectedProducts
  ) {
    const { error } =
      await db
        .from(
          "application_products"
        )
        .insert({
          application_id:
            application.id,

          product_id:
            product.product_id,

          quantity_used:
            product.quantity_used
        });

    if (error) {
      await db
        .from("applications")
        .delete()
        .eq(
          "id",
          application.id
        );

      message.textContent =
        error.message;

      return;
    }
  }

  event.target.reset();

  document.querySelector(
    "#application_date"
  ).value =
    new Date()
      .toISOString()
      .slice(0, 10);

  document
    .querySelector(
      "#application-form"
    )
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

  box.innerHTML =
    data
      .map(application => {
        const products =
          application
            .application_products ||
          [];

        return `
          <article
            class="card row"
          >
            <div>

              <h3>
                ${esc(
                  application
                    .application_date
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
                  .map(product => {
                    const chem =
                      product
                        .chemical_products;

                    return `
                      <span class="tag">
                        ${esc(
                          chem
                            ?.product_name ||
                          "Product"
                        )}
                        —
                        ${esc(
                          String(
                            product
                              .quantity_used
                          )
                        )}
                        ${esc(
                          chem?.unit ||
                          ""
                        )}
                      </span>
                    `;
                  })
                  .join(" ")}
              </p>

              ${
                application
                  .applicator_name
                  ? `
                    <p>
                      Applicator:
                      ${esc(
                        application
                          .applicator_name
                      )}
                    </p>
                  `
                  : ""
              }

              ${
                application
                  .tank_count != null
                  ? `
                    <p>
                      Tanks:
                      ${esc(
                        String(
                          application
                            .tank_count
                        )
                      )}
                    </p>
                  `
                  : ""
              }

              ${
                application
                    .temperature_c !=
                    null ||
                application
                    .wind_kmh !=
                    null
                  ? `
                    <p class="meta">

                      ${
                        application
                          .temperature_c !=
                        null
                          ? `${esc(
                              String(
                                application
                                  .temperature_c
                              )
                            )}°C`
                          : ""
                      }

                      ${
                        application
                            .temperature_c !=
                            null &&
                        application
                            .wind_kmh !=
                            null
                          ? " · "
                          : ""
                      }

                      ${
                        application
                          .wind_kmh !=
                        null
                          ? `${esc(
                              String(
                                application
                                  .wind_kmh
                              )
                            )} km/h wind`
                          : ""
                      }

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
          if (
            !confirm(
              "Delete this application? Its product quantities will be returned to inventory."
            )
          ) {
            return;
          }

          const { error } =
            await db
              .from("applications")
              .delete()
              .eq(
                "id",
                button.dataset.id
              );

          if (error) {
            alert(error.message);

            return;
          }

          await loadApplications();
        }
      );
    });
}

/* =====================================================
   OTHER PAGES
   ===================================================== */

const specs = {
  tasks: {
    title: "Tasks",
    table: "tasks",
    order: "created_at",

    fields: [
      [
        "title",
        "Title",
        "text"
      ],
      [
        "course",
        "Course",
        "text"
      ],
      [
        "area",
        "Area",
        "text"
      ],
      [
        "assigned_to",
        "Assigned to",
        "text"
      ],
      [
        "priority",
        "Priority",
        "text"
      ],
      [
        "status",
        "Status",
        "text"
      ],
      [
        "due_date",
        "Due date",
        "date"
      ],
      [
        "description",
        "Description",
        "textarea"
      ]
    ],

    display: row => `
      <h3>
        ${esc(row.title)}
      </h3>

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

      <p>
        ${esc(
          row.description || ""
        )}
      </p>

      <span class="tag">
        ${esc(row.status)}
      </span>
    `
  },

  jobs: {
    title: "Job Board",
    table: "jobs",
    order: "created_at",

    fields: [
      [
        "title",
        "Title",
        "text"
      ],
      [
        "job_type",
        "Job type",
        "text"
      ],
      [
        "course",
        "Course",
        "text"
      ],
      [
        "area",
        "Area",
        "text"
      ],
      [
        "assigned_to",
        "Assigned to",
        "text"
      ],
      [
        "priority",
        "Priority",
        "text"
      ],
      [
        "status",
        "Status",
        "text"
      ],
      [
        "due_date",
        "Due date",
        "date"
      ],
      [
        "description",
        "Description",
        "textarea"
      ]
    ],

    display: row => `
      <h3>
        ${esc(row.title)}
      </h3>

      <p class="meta">
        ${esc(
          [
            row.job_type,
            row.course,
            row.area
          ]
            .filter(Boolean)
            .join(" · ")
        )}
      </p>

      <p>
        ${esc(
          row.description || ""
        )}
      </p>
    `
  },

  chemicals: {
    title: "Chemical Inventory",
    table: "chemical_products",
    order: "product_name",

    fields: [
      [
        "product_name",
        "Product name",
        "text"
      ],
      [
        "product_type",
        "Product type",
        "text"
      ],
      [
        "manufacturer",
        "Manufacturer",
        "text"
      ],
      [
        "quantity",
        "Quantity",
        "number"
      ],
      [
        "unit",
        "Unit",
        "text"
      ],
      [
        "storage_location",
        "Storage location",
        "text"
      ],
      [
        "reorder_level",
        "Reorder level",
        "number"
      ]
    ],

    display: row => {
      const low =
        row.reorder_level != null &&
        Number(row.quantity) <=
          Number(row.reorder_level);

      return `
        <h3>
          ${esc(
            row.product_name
          )}
        </h3>

        <p>
          <span class="tag">
            ${esc(
              String(
                row.quantity ?? 0
              )
            )}
            ${esc(
              row.unit || ""
            )}
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
              row.product_type,
              row.manufacturer,
              row.storage_location
            ]
              .filter(Boolean)
              .join(" · ")
          )}
        </p>
      `;
    }
  },

  calendar: {
    title: "Calendar",
    table: "calendar_entries",
    order: "start_date",

    fields: [
      [
        "title",
        "Title",
        "text"
      ],
      [
        "entry_type",
        "Entry type",
        "text"
      ],
      [
        "start_date",
        "Start date",
        "date"
      ],
      [
        "end_date",
        "End date",
        "date"
      ],
      [
        "staff_member",
        "Staff member",
        "text"
      ],
      [
        "description",
        "Description",
        "textarea"
      ]
    ],

    display: row => `
      <h3>
        ${esc(row.title)}
      </h3>

      <p class="meta">
        ${esc(row.start_date)}

        ${
          row.end_date
            ? ` – ${esc(
                row.end_date
              )}`
            : ""
        }

        ·

        ${esc(
          row.entry_type ||
          "event"
        )}
      </p>

      <p>
        ${esc(
          row.description || ""
        )}
      </p>
    `
  },

  greens: {
    title: "Greens",
    table: "greens_logs",
    order: "reading_date",

    fields: [
      [
        "reading_date",
        "Date",
        "date"
      ],
      [
        "course",
        "Course",
        "text"
      ],
      [
        "green_name",
        "Green",
        "text"
      ],
      [
        "moisture",
        "Moisture",
        "number"
      ],
      [
        "firmness",
        "Firmness",
        "number"
      ],
      [
        "green_speed",
        "Green speed",
        "number"
      ],
      [
        "mowing_height_mm",
        "Mowing height mm",
        "number"
      ],
      [
        "soil_temperature_c",
        "Soil temp °C",
        "number"
      ],
      [
        "air_temperature_c",
        "Air temp °C",
        "number"
      ],
      [
        "notes",
        "Notes",
        "textarea"
      ]
    ],

    display: row => `
      <h3>
        ${esc(
          row.green_name
        )}
      </h3>

      <p class="meta">
        ${esc(
          row.reading_date
        )}
      </p>

      <p>
        Moisture
        ${esc(
          String(
            row.moisture ??
            "—"
          )
        )}

        · Firmness
        ${esc(
          String(
            row.firmness ??
            "—"
          )
        )}

        · Speed
        ${esc(
          String(
            row.green_speed ??
            "—"
          )
        )}
      </p>
    `
  },

  equipment: {
    title: "Equipment",
    table: "equipment",
    order: "equipment_name",

    fields: [
      [
        "equipment_name",
        "Equipment name",
        "text"
      ],
      [
        "manufacturer",
        "Manufacturer",
        "text"
      ],
      [
        "model",
        "Model",
        "text"
      ],
      [
        "fleet_number",
        "Fleet number",
        "text"
      ],
      [
        "serial_number",
        "Serial number",
        "text"
      ],
      [
        "status",
        "Status",
        "select",
        [
          [
            "operational",
            "Operational"
          ],
          [
            "needs_repair",
            "Needs repair"
          ],
          [
            "down",
            "Down"
          ]
        ]
      ],
      [
        "hours",
        "Hours",
        "number"
      ],
      [
        "next_service_date",
        "Next service date",
        "date"
      ],
      [
        "notes",
        "Notes",
        "textarea"
      ]
    ],

    display: row => `
      <h3>
        ${esc(
          row.equipment_name
        )}
      </h3>

      <p class="meta">
        ${esc(
          [
            row.manufacturer,
            row.model,
            row.fleet_number
          ]
            .filter(Boolean)
            .join(" · ")
        )}
      </p>

      <span class="tag">
        ${esc(
          row.status
        )}
      </span>

      <p>
        ${esc(
          row.notes || ""
        )}
      </p>
    `
  },

  notes: {
    title: "Notes",
    table: "daily_notes",
    order: "note_date",

    fields: [
      [
        "note_date",
        "Date",
        "date"
      ],
      [
        "category",
        "Category",
        "text"
      ],
      [
        "note_text",
        "Note",
        "textarea"
      ]
    ],

    display: row => `
      <h3>
        ${esc(
          row.note_date
        )}

        ${
          row.category
            ? `
              <span class="tag">
                ${esc(
                  row.category
                )}
              </span>
            `
            : ""
        }
      </h3>

      <p>
        ${esc(
          row.note_text
        )}
      </p>
    `
  }
};

/* =====================================================
   GENERIC CRUD
   ===================================================== */

async function renderCrud(
  page,
  spec
) {
  page.innerHTML = `
    <div class="heading">
      <h2>
        ${spec.title}
      </h2>

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

      <button
        class="primary"
        type="submit"
      >
        Save
      </button>

      <p id="form-message"></p>
    </form>

    <section
      id="records"
      class="list"
    ></section>
  `;

  document
    .querySelector(
      "#toggle-form"
    )
    .addEventListener(
      "click",
      () => {
        document
          .querySelector(
            "#record-form"
          )
          .classList
          .toggle("hidden");
      }
    );

  document
    .querySelector(
      "#record-form"
    )
    .addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const payload = {};

        for (
          const [
            key,
            ,
            type
          ] of
          spec.fields
        ) {
          let fieldValue =
            document
              .getElementById(
                key
              )
              .value
              .trim();

          if (
            fieldValue === ""
          ) {
            fieldValue =
              null;
          }

          if (
            type ===
              "number" &&
            fieldValue !==
              null
          ) {
            fieldValue =
              Number(
                fieldValue
              );
          }

          payload[key] =
            fieldValue;
        }

        const { error } =
          await db
            .from(
              spec.table
            )
            .insert(
              payload
            );

        if (error) {
          document
            .querySelector(
              "#form-message"
            )
            .textContent =
            error.message;

          return;
        }

        event.target.reset();

        event.target
          .classList
          .add("hidden");

        loadRecords(
          spec
        );
      }
    );

  loadRecords(spec);
}

async function loadRecords(
  spec
) {
  const box =
    document.querySelector(
      "#records"
    );

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
        ${esc(
          error.message
        )}
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

  box.innerHTML =
    data
      .map(
        row => `
          <article
            class="card row"
          >
            <div>
              ${spec.display(
                row
              )}
            </div>

            <button
              class="delete"
              data-id="${row.id}"
            >
              Delete
            </button>
          </article>
        `
      )
      .join("");

  box
    .querySelectorAll(
      ".delete"
    )
    .forEach(
      button => {
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

            await db
              .from(
                spec.table
              )
              .delete()
              .eq(
                "id",
                button.dataset.id
              );

            loadRecords(
              spec
            );
          }
        );
      }
    );
}

/* =====================================================
   STAFF
   ===================================================== */

async function renderStaff(
  page
) {
  page.innerHTML = `
    <div class="heading">
      <h2>
        Staff
      </h2>
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
        ${esc(
          error.message
        )}
      </div>
    `;

    return;
  }

  box.innerHTML =
    cards(
      data,
      row => `
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
              row.role ||
              "crew"
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
      `
    );
}

/* =====================================================
   FORM HELPERS
   ===================================================== */

function fieldHtml(
  [
    key,
    label,
    type,
    options
  ]
) {
  if (
    type ===
    "textarea"
  ) {
    return `
      <label>
        ${label}

        <textarea
          id="${key}"
        ></textarea>
      </label>
    `;
  }

  if (
    type ===
    "select"
  ) {
    return `
      <label>
        ${label}

        <select
          id="${key}"
        >
          ${options
            .map(
              ([
                optionValue,
                text
              ]) => `
                <option
                  value="${optionValue}"
                >
                  ${text}
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
          type ===
          "number"
            ? 'step="any"'
            : ""
        }
      >
    </label>
  `;
}

function cards(
  rows,
  render
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
            <article
              class="card"
            >
              ${render(row)}
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function nullable(id) {
  const value =
    document
      .querySelector(
        `#${id}`
      )
      .value
      .trim();

  return value === ""
    ? null
    : value;
}

function nullableNumber(
  id
) {
  const value =
    document
      .querySelector(
        `#${id}`
      )
      .value
      .trim();

  return value === ""
    ? null
    : Number(value);
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
