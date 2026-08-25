const cfg = window.APP_CONFIG;

const db = supabase.createClient(
  cfg.SUPABASE_URL,
  cfg.SUPABASE_ANON_KEY
);

/* =====================================================
   CONFIG
   ===================================================== */

const BRAMPTON_GOLF_LAT = 43.66502;
const BRAMPTON_GOLF_LON = -79.71436;

const PROFILE_EDITOR_ROLES = [
  "admin",
  "superintendent",
  "assistant",
  "mechanic"
];

const state = {
  page: "home",
  calendarMonth: null,
  currentProfile: null
};

const navItems = [
  ["home", "Home"],
  ["tasks", "Tasks"],
  ["jobs", "Job Board"],
  ["applications", "Applications"],
  ["chemicals", "Chem Inventory"],
  ["calendar", "Calendar"],
  ["equipment", "Equipment"],
  ["staff", "Staff"],
  ["notes", "Notes"]
];

/* =====================================================
   STARTUP / AUTH
   ===================================================== */

document.addEventListener(
  "DOMContentLoaded",
  init
);

async function init() {
  renderNav();

  document
    .querySelector("#login-form")
    .addEventListener(
      "submit",
      login
    );

  document
    .querySelector("#sign-out-button")
    .addEventListener(
      "click",
      () => db.auth.signOut()
    );

  const { data } =
    await db.auth.getSession();

  await showForSession(
    data.session
  );

  db.auth.onAuthStateChange(
    async (_event, session) => {
      await showForSession(
        session
      );
    }
  );
}

async function login(event) {
  event.preventDefault();

  const email =
    document
      .querySelector("#login-email")
      .value
      .trim();

  const password =
    document
      .querySelector("#login-password")
      .value;

  const message =
    document.querySelector(
      "#login-message"
    );

  message.textContent = "";

  const { error } =
    await db.auth
      .signInWithPassword({
        email,
        password
      });

  if (error) {
    message.textContent =
      error.message;
  }
}

async function showForSession(
  session
) {
  document
    .querySelector("#login-screen")
    .classList.toggle(
      "hidden",
      !!session
    );

  document
    .querySelector("#app-shell")
    .classList.toggle(
      "hidden",
      !session
    );

  if (!session) {
    state.currentProfile =
      null;

    return;
  }

  await loadCurrentProfile(
    session.user.id
  );

  await renderPage();
}

async function loadCurrentProfile(
  userId
) {
  const {
    data,
    error
  } =
    await db
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        phone,
        position,
        role,
        active
      `)
      .eq(
        "id",
        userId
      )
      .maybeSingle();

  if (error) {
    console.error(
      "Could not load current profile:",
      error
    );

    state.currentProfile =
      null;

    return;
  }

  state.currentProfile =
    data || null;
}

function canCurrentUserEditProfiles() {
  return (
    state.currentProfile?.active !== false &&
    PROFILE_EDITOR_ROLES.includes(
      state.currentProfile?.role
    )
  );
}

/* =====================================================
   NAVIGATION
   ===================================================== */

function renderNav() {
  const nav =
    document.querySelector(
      "#nav"
    );

  nav.innerHTML =
    navItems
      .map(
        ([key, label]) => `
          <button
            data-page="${key}"
            class="${
              key === state.page
                ? "active"
                : ""
            }"
          >
            ${label}
          </button>
        `
      )
      .join("");

  nav.addEventListener(
    "click",
    event => {
      const button =
        event.target.closest(
          "button[data-page]"
        );

      if (!button) {
        return;
      }

      state.page =
        button.dataset.page;

      [
        ...nav.querySelectorAll(
          "button"
        )
      ].forEach(item => {
        item.classList.toggle(
          "active",
          item === button
        );
      });

      renderPage();
    }
  );
}

async function renderPage() {
  const page =
    document.querySelector(
      "#page"
    );

  if (
    state.page ===
    "home"
  ) {
    return renderHome(
      page
    );
  }

  if (
    state.page ===
    "applications"
  ) {
    return renderApplications(
      page
    );
  }

  if (
    state.page ===
    "chemicals"
  ) {
    return renderChemicalInventory(
      page
    );
  }

  if (
    state.page ===
    "staff"
  ) {
    return renderStaff(
      page
    );
  }

  const spec =
    specs[state.page];

  if (spec) {
    return renderCrud(
      page,
      spec
    );
  }
}

/* =====================================================
   HOME
   ===================================================== */

async function renderHome(
  page
) {
  if (
    !state.calendarMonth
  ) {
    state.calendarMonth =
      new Date();

    state.calendarMonth
      .setDate(1);
  }

  const monthStart =
    new Date(
      state.calendarMonth
        .getFullYear(),
      state.calendarMonth
        .getMonth(),
      1
    );

  const monthEnd =
    new Date(
      state.calendarMonth
        .getFullYear(),
      state.calendarMonth
        .getMonth() + 1,
      0
    );

  const [
    tasks,
    equipment,
    notes,
    calendar,
    chemicals
  ] =
    await Promise.all([
      db
        .from("tasks")
        .select("*", {
          count: "exact",
          head: true
        })
        .neq(
          "status",
          "done"
        ),

      db
        .from("equipment")
        .select("*", {
          count: "exact",
          head: true
        })
        .eq(
          "status",
          "down"
        ),

      db
        .from("daily_notes")
        .select("*")
        .order(
          "note_date",
          {
            ascending:
              false
          }
        )
        .limit(3),

      db
        .from(
          "calendar_entries"
        )
        .select("*")
        .lte(
          "start_date",
          formatDate(
            monthEnd
          )
        )
        .or(
          `end_date.gte.${formatDate(
            monthStart
          )},end_date.is.null`
        )
        .order(
          "start_date"
        ),

      db
        .from(
          "chemical_products"
        )
        .select("*")
        .eq(
          "active",
          true
        )
    ]);

  const lowProducts =
    (
      chemicals.data ||
      []
    ).filter(
      product => {
        if (
          product.reorder_level ==
          null
        ) {
          return false;
        }

        return (
          Number(
            product.quantity
          ) <=
          Number(
            product.reorder_level
          )
        );
      }
    );

  page.innerHTML = `
    <div class="heading">
      <h2>
        Home
      </h2>
    </div>

    <div class="grid">

      <div class="card">
        <div class="meta">
          Open Tasks
        </div>

        <h3>
          ${tasks.count ?? 0}
        </h3>
      </div>

      <div class="card">
        <div class="meta">
          Equipment Down
        </div>

        <h3>
          ${equipment.count ?? 0}
        </h3>
      </div>

      <div class="card">
        <div class="meta">
          Low Stock Products
        </div>

        <h3>
          ${lowProducts.length}
        </h3>
      </div>

    </div>

    <div
      class="card"
      style="
        margin-top:24px;
      "
    >

      <div
        style="
          display:flex;
          justify-content:
            space-between;
          align-items:center;
          gap:12px;
          margin-bottom:
            18px;
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
            color:
              var(--navy);
          "
        >
          ${
            monthStart
              .toLocaleDateString(
                "en-CA",
                {
                  month:
                    "long",
                  year:
                    "numeric"
                }
              )
          }
        </h2>

        <button
          id="calendar-next"
          class="primary"
          type="button"
        >
          ›
        </button>

      </div>

      ${
        buildMonthCalendar(
          monthStart,
          calendar.data ||
            []
        )
      }

    </div>

    <h3
      style="
        margin-top:28px;
      "
    >
      Recent Notes
    </h3>

    ${
      cards(
        notes.data,
        row => `
          <h3>
            ${
              esc(
                row.note_date
              )
            }
          </h3>

          <p>
            ${
              esc(
                row.note_text
              )
            }
          </p>
        `
      )
    }
  `;

  document
    .querySelector(
      "#calendar-prev"
    )
    .addEventListener(
      "click",
      () => {
        state.calendarMonth =
          new Date(
            state.calendarMonth
              .getFullYear(),
            state.calendarMonth
              .getMonth() -
              1,
            1
          );

        renderHome(
          page
        );
      }
    );

  document
    .querySelector(
      "#calendar-next"
    )
    .addEventListener(
      "click",
      () => {
        state.calendarMonth =
          new Date(
            state.calendarMonth
              .getFullYear(),
            state.calendarMonth
              .getMonth() +
              1,
            1
          );

        renderHome(
          page
        );
      }
    );
}

function buildMonthCalendar(
  monthStart,
  events
) {
  const year =
    monthStart
      .getFullYear();

  const month =
    monthStart
      .getMonth();

  const firstDay =
    new Date(
      year,
      month,
      1
    ).getDay();

  const daysInMonth =
    new Date(
      year,
      month + 1,
      0
    ).getDate();

  const previousMonthDays =
    new Date(
      year,
      month,
      0
    ).getDate();

  const todayDate =
    new Date();

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
        grid-template-columns:
          repeat(
            7,
            minmax(0,1fr)
          );
        gap:4px;
      "
    >
  `;

  for (
    const dayName
    of dayNames
  ) {
    html += `
      <div
        style="
          text-align:center;
          font-weight:800;
          padding:
            8px 2px;
          color:
            var(--navy);
          font-size:
            .82rem;
        "
      >
        ${dayName}
      </div>
    `;
  }

  for (
    let cell = 0;
    cell < 42;
    cell++
  ) {
    let dayNumber;
    let cellDate;
    let otherMonth =
      false;

    if (
      cell <
      firstDay
    ) {
      dayNumber =
        previousMonthDays -
        firstDay +
        cell +
        1;

      cellDate =
        new Date(
          year,
          month - 1,
          dayNumber
        );

      otherMonth =
        true;
    } else if (
      cell >=
      firstDay +
        daysInMonth
    ) {
      dayNumber =
        cell -
        firstDay -
        daysInMonth +
        1;

      cellDate =
        new Date(
          year,
          month + 1,
          dayNumber
        );

      otherMonth =
        true;
    } else {
      dayNumber =
        cell -
        firstDay +
        1;

      cellDate =
        new Date(
          year,
          month,
          dayNumber
        );
    }

    const dateString =
      formatDate(
        cellDate
      );

    const isToday =
      cellDate
        .getFullYear() ===
        todayDate
          .getFullYear() &&
      cellDate
        .getMonth() ===
        todayDate
          .getMonth() &&
      cellDate
        .getDate() ===
        todayDate
          .getDate();

    const dayEvents =
      events.filter(
        event => {
          const start =
            event.start_date;

          const end =
            event.end_date ||
            event.start_date;

          return (
            dateString >=
              start &&
            dateString <=
              end
          );
        }
      );

    html += `
      <div
        style="
          min-height:
            105px;
          min-width:0;
          border:
            1px solid
            var(--border);
          border-radius:
            8px;
          padding:6px;
          background:
            ${
              otherMonth
                ? "#f7f7f7"
                : "#fff"
            };
          opacity:
            ${
              otherMonth
                ? ".55"
                : "1"
            };
        "
      >

        <div
          style="
            display:flex;
            justify-content:
              flex-end;
            margin-bottom:
              5px;
          "
        >

          <span
            style="
              display:grid;
              place-items:center;
              width:28px;
              height:28px;
              border-radius:
                50%;
              font-weight:800;

              ${
                isToday
                  ? `
                    background:
                      #006747;
                    color:#fff;
                  `
                  : ""
              }
            "
          >
            ${dayNumber}
          </span>

        </div>

        ${
          dayEvents
            .map(
              event => `
                <div
                  style="
                    font-size:
                      .72rem;
                    font-weight:
                      700;
                    padding:
                      4px 5px;
                    margin-bottom:
                      4px;
                    border-radius:
                      6px;
                    background:
                      #e7f2ed;
                    color:
                      #004B2B;
                    overflow:
                      hidden;
                    word-break:
                      break-word;
                  "
                >
                  ${
                    esc(
                      event.title
                    )
                  }
                </div>
              `
            )
            .join("")
        }

      </div>
    `;
  }

  html += `
    </div>
  `;

  return html;
}

/* =====================================================
   APPLICATIONS
   ===================================================== */

async function renderApplications(
  page
) {
  const {
    data: products,
    error:
      productError
  } =
    await db
      .from(
        "chemical_products"
      )
      .select(`
        id,
        product_name,
        quantity,
        unit
      `)
      .eq(
        "active",
        true
      )
      .order(
        "product_name"
      );

  if (
    productError
  ) {
    page.innerHTML = `
      <div class="heading">
        <h2>
          Applications
        </h2>
      </div>

      <div class="empty">
        ${
          esc(
            productError.message
          )
        }
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
        type="button"
      >
        + New Application
      </button>

    </div>

    <div
      class="card"
      style="
        margin-bottom:20px;
      "
    >

      <h3>
        Monthly Application Summary
      </h3>

      <p class="meta">
        Select a month to view
        product usage totals and
        all applications from that
        month.
      </p>

      <div
        style="
          display:flex;
          gap:10px;
          align-items:
            flex-end;
          flex-wrap:wrap;
        "
      >

        <label
          style="
            margin:0;
          "
        >
          Month

          <input
            id="application-summary-month"
            type="month"
            value="${
              today()
                .slice(
                  0,
                  7
                )
            }"
          >
        </label>

        <button
          id="view-application-summary"
          class="primary"
          type="button"
        >
          View Monthly Summary
        </button>

      </div>

    </div>

    <section
      id="application-month-summary"
    ></section>

    <form
      id="application-form"
      class="form hidden"
    >

      <h3>
        New Application
      </h3>

      <div
        class="form-grid"
      >

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
          Application Time

          <input
            id="application_time"
            type="time"
            required
            value="${
              currentTimeValue()
            }"
          >
        </label>

        <label>
          Course

          <input
            id="application_course"
            type="text"
            value="Brampton Golf Club"
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
            step="0.1"
          >

          <span
            id="weather-temperature-status"
            class="meta"
          ></span>
        </label>

        <label>
          Wind km/h

          <input
            id="application_wind"
            type="number"
            step="0.1"
          >

          <span
            id="weather-wind-status"
            class="meta"
          ></span>
        </label>

      </div>

      <div
        id="weather-status"
        class="meta"
        style="
          margin-bottom:18px;
        "
      ></div>

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

      <p
        id="application-message"
      ></p>

    </form>

    <h3
      style="
        margin-top:24px;
      "
    >
      Application History
    </h3>

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
      async () => {
        const form =
          document
            .querySelector(
              "#application-form"
            );

        form
          .classList
          .toggle(
            "hidden"
          );

        if (
          !form.classList
            .contains(
              "hidden"
            )
        ) {
          await autofillApplicationWeather();
        }
      }
    );

  document
    .querySelector(
      "#view-application-summary"
    )
    .addEventListener(
      "click",
      async () => {
        const month =
          document
            .querySelector(
              "#application-summary-month"
            )
            .value;

        await loadApplicationMonthSummary(
          month
        );
      }
    );

  document
    .querySelector(
      "#application_date"
    )
    .addEventListener(
      "change",
      autofillApplicationWeather
    );

  document
    .querySelector(
      "#application_time"
    )
    .addEventListener(
      "change",
      autofillApplicationWeather
    );

  const productRows =
    document.querySelector(
      "#application-product-rows"
    );

  function addProductRow() {
    const row =
      document
        .createElement(
          "div"
        );

    row.className =
      "card";

    row.style
      .marginBottom =
      "12px";

    row.innerHTML = `
      <div
        class="form-grid"
      >

        <label>
          Product

          <select
            class="application-product-select"
            required
          >

            <option
              value=""
            >
              Choose product…
            </option>

            ${
              products
                .map(
                  product => `
                    <option
                      value="${
                        product.id
                      }"
                      data-stock="${
                        product.quantity ??
                        0
                      }"
                      data-unit="${
                        esc(
                          product.unit ||
                          ""
                        )
                      }"
                    >
                      ${
                        esc(
                          product
                            .product_name
                        )
                      }
                      —
                      ${
                        esc(
                          String(
                            product.quantity ??
                            0
                          )
                        )
                      }
                      ${
                        esc(
                          product.unit ||
                          ""
                        )
                      }
                      available
                    </option>
                  `
                )
                .join("")
            }

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

    select.addEventListener(
      "change",
      () => {
        const option =
          select
            .selectedOptions[0];

        if (
          !option?.value
        ) {
          help.textContent =
            "Select a product.";

          return;
        }

        help.textContent =
          `${
            option.dataset.stock
          } ${
            option.dataset.unit
          } currently in inventory`;
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
            productRows
              .children
              .length <=
            1
          ) {
            return;
          }

          row.remove();
        }
      );

    productRows
      .appendChild(
        row
      );
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
      event => {
        saveApplication(
          event,
          products
        );
      }
    );

  await loadApplications();
}

/* =====================================================
   APPLICATION WEATHER
   ===================================================== */

async function autofillApplicationWeather() {
  const dateInput =
    document.querySelector(
      "#application_date"
    );

  const timeInput =
    document.querySelector(
      "#application_time"
    );

  const temperatureInput =
    document.querySelector(
      "#application_temperature"
    );

  const windInput =
    document.querySelector(
      "#application_wind"
    );

  const temperatureStatus =
    document.querySelector(
      "#weather-temperature-status"
    );

  const windStatus =
    document.querySelector(
      "#weather-wind-status"
    );

  const overallStatus =
    document.querySelector(
      "#weather-status"
    );

  if (
    !dateInput ||
    !timeInput ||
    !temperatureInput ||
    !windInput
  ) {
    return;
  }

  const date =
    dateInput.value;

  const time =
    timeInput.value;

  if (
    !date ||
    !time
  ) {
    return;
  }

  temperatureStatus.textContent =
    "Loading weather…";

  windStatus.textContent =
    "Loading weather…";

  overallStatus.textContent =
    "Getting Brampton Golf Club weather…";

  try {
    const todayString =
      today();

    let apiUrl;

    if (
      date <
      todayString
    ) {
      apiUrl =
        "https://archive-api.open-meteo.com/v1/archive" +
        `?latitude=${BRAMPTON_GOLF_LAT}` +
        `&longitude=${BRAMPTON_GOLF_LON}` +
        `&start_date=${date}` +
        `&end_date=${date}` +
        "&hourly=temperature_2m,wind_speed_10m" +
        "&temperature_unit=celsius" +
        "&wind_speed_unit=kmh" +
        "&timezone=America%2FToronto";
    } else {
      apiUrl =
        "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${BRAMPTON_GOLF_LAT}` +
        `&longitude=${BRAMPTON_GOLF_LON}` +
        `&start_date=${date}` +
        `&end_date=${date}` +
        "&hourly=temperature_2m,wind_speed_10m" +
        "&temperature_unit=celsius" +
        "&wind_speed_unit=kmh" +
        "&timezone=America%2FToronto";
    }

    const response =
      await fetch(
        apiUrl
      );

    if (
      !response.ok
    ) {
      throw new Error(
        "Weather service unavailable."
      );
    }

    const weather =
      await response.json();

    if (
      !weather.hourly ||
      !Array.isArray(
        weather.hourly.time
      )
    ) {
      throw new Error(
        "No weather data available for this date."
      );
    }

    const selectedMinutes =
      timeToMinutes(
        time
      );

    let closestIndex =
      -1;

    let closestDifference =
      Infinity;

    weather.hourly.time
      .forEach(
        (
          weatherTime,
          index
        ) => {
          const weatherClock =
            weatherTime.slice(
              11,
              16
            );

          const weatherMinutes =
            timeToMinutes(
              weatherClock
            );

          const difference =
            Math.abs(
              weatherMinutes -
              selectedMinutes
            );

          if (
            difference <
            closestDifference
          ) {
            closestDifference =
              difference;

            closestIndex =
              index;
          }
        }
      );

    if (
      closestIndex ===
      -1
    ) {
      throw new Error(
        "Could not match weather to the selected application time."
      );
    }

    const temperature =
      weather
        .hourly
        .temperature_2m[
          closestIndex
        ];

    const wind =
      weather
        .hourly
        .wind_speed_10m[
          closestIndex
        ];

    const matchedTime =
      weather
        .hourly
        .time[
          closestIndex
        ]
        .slice(
          11,
          16
        );

    if (
      temperature !=
      null
    ) {
      temperatureInput.value =
        Number(
          temperature
        ).toFixed(
          1
        );

      temperatureStatus.textContent =
        `Auto-filled using ${formatTimeForDisplay(
          matchedTime
        )} weather`;
    }

    if (
      wind !=
      null
    ) {
      windInput.value =
        Number(
          wind
        ).toFixed(
          1
        );

      windStatus.textContent =
        `Auto-filled using ${formatTimeForDisplay(
          matchedTime
        )} weather`;
    }

    overallStatus.textContent =
      `Weather loaded for Brampton Golf Club near ${formatTimeForDisplay(
        matchedTime
      )}. Values can still be changed manually.`;

  } catch (error) {
    console.error(
      "Weather lookup error:",
      error
    );

    temperatureStatus.textContent =
      "Enter manually.";

    windStatus.textContent =
      "Enter manually.";

    overallStatus.textContent =
      "Weather could not be loaded. Enter temperature and wind manually.";
  }
}

/* =====================================================
   MONTHLY APPLICATION SUMMARY
   ===================================================== */

async function loadApplicationMonthSummary(
  monthValue
) {
  const box =
    document.querySelector(
      "#application-month-summary"
    );

  if (
    !box ||
    !monthValue
  ) {
    return;
  }

  box.innerHTML = `
    <div class="empty">
      Loading monthly summary…
    </div>
  `;

  const [
    year,
    month
  ] =
    monthValue
      .split("-")
      .map(Number);

  const startDate =
    `${year}-${String(
      month
    ).padStart(
      2,
      "0"
    )}-01`;

  let nextYear =
    year;

  let nextMonth =
    month + 1;

  if (
    nextMonth === 13
  ) {
    nextMonth =
      1;

    nextYear++;
  }

  const endDate =
    `${nextYear}-${String(
      nextMonth
    ).padStart(
      2,
      "0"
    )}-01`;

  const {
    data,
    error
  } =
    await db
      .from(
        "applications"
      )
      .select(`
        id,
        application_date,
        application_time,
        course,
        area,
        holes,
        applicator_name,
        tank_count,
        temperature_c,
        wind_kmh,
        notes,

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
      .gte(
        "application_date",
        startDate
      )
      .lt(
        "application_date",
        endDate
      )
      .order(
        "application_date",
        {
          ascending:
            true
        }
      );

  if (
    error
  ) {
    box.innerHTML = `
      <div class="empty">
        ${
          esc(
            error.message
          )
        }
      </div>
    `;

    return;
  }

  const monthTitle =
    new Date(
      year,
      month - 1,
      1
    )
      .toLocaleDateString(
        "en-CA",
        {
          month:
            "long",
          year:
            "numeric"
        }
      );

  if (
    !data?.length
  ) {
    box.innerHTML = `
      <div
        class="card"
        style="
          margin-bottom:20px;
        "
      >

        <h2>
          ${
            esc(
              monthTitle
            )
          }
          Application Summary
        </h2>

        <p>
          No applications were
          recorded for this month.
        </p>

      </div>
    `;

    return;
  }

  const productTotals =
    {};

  let totalProductEntries =
    0;

  data.forEach(
    application => {
      const products =
        application
          .application_products ||
        [];

      products.forEach(
        item => {
          totalProductEntries++;

          const chemical =
            item
              .chemical_products;

          const name =
            chemical
              ?.product_name ||
            "Unknown Product";

          const unit =
            chemical
              ?.unit ||
            "";

          const key =
            item.product_id ||
            `${name}|||${unit}`;

          if (
            !productTotals[
              key
            ]
          ) {
            productTotals[
              key
            ] = {
              name,
              unit,
              quantity:
                0
            };
          }

          productTotals[
            key
          ].quantity +=
            Number(
              item
                .quantity_used ||
              0
            );
        }
      );
    }
  );

  const totals =
    Object.values(
      productTotals
    ).sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );

  box.innerHTML = `
    <div
      class="card"
      style="
        margin-bottom:24px;
      "
    >

      <h2
        style="
          color:
            var(--navy);
        "
      >
        ${
          esc(
            monthTitle
          )
        }
        Application Summary
      </h2>

      <div class="grid">

        <div class="card">

          <div class="meta">
            Applications
          </div>

          <h3>
            ${data.length}
          </h3>

        </div>

        <div class="card">

          <div class="meta">
            Different Products
          </div>

          <h3>
            ${totals.length}
          </h3>

        </div>

        <div class="card">

          <div class="meta">
            Product Entries
          </div>

          <h3>
            ${
              totalProductEntries
            }
          </h3>

        </div>

      </div>

      <h3
        style="
          margin-top:26px;
        "
      >
        Product Totals
      </h3>

      <div class="list">

        ${
          totals
            .map(
              product => `
                <article
                  class="card row"
                >

                  <div>

                    <h3>
                      ${
                        esc(
                          product.name
                        )
                      }
                    </h3>

                    <p class="meta">
                      Total used during
                      ${
                        esc(
                          monthTitle
                        )
                      }
                    </p>

                  </div>

                  <span
                    class="tag"
                  >
                    ${
                      esc(
                        formatQuantity(
                          product.quantity
                        )
                      )
                    }
                    ${
                      esc(
                        product.unit
                      )
                    }
                  </span>

                </article>
              `
            )
            .join("")
        }

      </div>

      <h3
        style="
          margin-top:28px;
        "
      >
        Applications
      </h3>

      <div class="list">

        ${
          data
            .map(
              application => {
                const products =
                  application
                    .application_products ||
                  [];

                return `
                  <article
                    class="card"
                  >

                    <h3>
                      ${
                        formatDisplayDate(
                          application
                            .application_date
                        )
                      }

                      ${
                        application
                          .application_time
                          ? `
                            ·
                            ${formatTimeForDisplay(
                              application
                                .application_time
                            )}
                          `
                          : ""
                      }
                    </h3>

                    ${
                      application.course ||
                      application.area ||
                      application.holes
                        ? `
                          <p class="meta">
                            ${
                              esc(
                                [
                                  application.course,
                                  application.area,
                                  application.holes
                                ]
                                  .filter(
                                    Boolean
                                  )
                                  .join(
                                    " · "
                                  )
                              )
                            }
                          </p>
                        `
                        : ""
                    }

                    <p>
                      ${
                        products
                          .map(
                            item => `
                              <span
                                class="tag"
                              >
                                ${
                                  esc(
                                    item
                                      .chemical_products
                                      ?.product_name ||
                                    "Product"
                                  )
                                }
                                —
                                ${
                                  esc(
                                    formatQuantity(
                                      item
                                        .quantity_used
                                    )
                                  )
                                }
                                ${
                                  esc(
                                    item
                                      .chemical_products
                                      ?.unit ||
                                    ""
                                  )
                                }
                              </span>
                            `
                          )
                          .join(" ")
                      }
                    </p>

                    ${
                      application
                        .applicator_name
                        ? `
                          <p>
                            <strong>
                              Applicator:
                            </strong>

                            ${
                              esc(
                                application
                                  .applicator_name
                              )
                            }
                          </p>
                        `
                        : ""
                    }

                    ${
                      application
                        .tank_count !=
                        null
                        ? `
                          <p>
                            <strong>
                              Tanks:
                            </strong>

                            ${
                              esc(
                                formatQuantity(
                                  application
                                    .tank_count
                                )
                              )
                            }
                          </p>
                        `
                        : ""
                    }

                    ${
                      application
                        .temperature_c !=
                        null
                        ? `
                          <p class="meta">
                            Temperature:
                            ${
                              esc(
                                formatQuantity(
                                  application
                                    .temperature_c
                                )
                              )
                            }°C
                          </p>
                        `
                        : ""
                    }

                    ${
                      application
                        .wind_kmh !=
                        null
                        ? `
                          <p class="meta">
                            Wind:
                            ${
                              esc(
                                formatQuantity(
                                  application
                                    .wind_kmh
                                )
                              )
                            }
                            km/h
                          </p>
                        `
                        : ""
                    }

                    ${
                      application.notes
                        ? `
                          <p>
                            ${
                              esc(
                                application.notes
                              )
                            }
                          </p>
                        `
                        : ""
                    }

                  </article>
                `;
              }
            )
            .join("")
        }

      </div>

    </div>
  `;
}

/* =====================================================
   SAVE APPLICATION
   ===================================================== */

async function saveApplication(
  event,
  products
) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#application-message"
    );

  message.textContent =
    "";

  const rows = [
    ...document
      .querySelectorAll(
        "#application-product-rows > .card"
      )
  ];

  if (
    !rows.length
  ) {
    message.textContent =
      "Add at least one product.";

    return;
  }

  const selectedProducts =
    [];

  for (
    const row
    of rows
  ) {
    const productId =
      row
        .querySelector(
          ".application-product-select"
        )
        .value;

    const quantity =
      Number(
        row
          .querySelector(
            ".application-product-quantity"
          )
          .value
      );

    if (
      !productId ||
      !Number.isFinite(
        quantity
      ) ||
      quantity <=
        0
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
        "The same product is listed more than once. Combine it into one quantity.";

      return;
    }

    const product =
      products.find(
        item =>
          item.id ===
          productId
      );

    if (
      product &&
      Number(
        product.quantity
      ) <
        quantity
    ) {
      message.textContent =
        `Not enough ${
          product.product_name
        }. Available: ${
          product.quantity
        } ${
          product.unit ||
          ""
        }.`;

      return;
    }

    selectedProducts.push({
      product_id:
        productId,

      quantity_used:
        quantity
    });
  }

  const payload = {
    application_date:
      document
        .querySelector(
          "#application_date"
        )
        .value,

    application_time:
      document
        .querySelector(
          "#application_time"
        )
        .value ||
      null,

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
    data:
      application,
    error
  } =
    await db
      .from(
        "applications"
      )
      .insert(
        payload
      )
      .select()
      .single();

  if (
    error
  ) {
    message.textContent =
      error.message;

    return;
  }

  for (
    const product
    of selectedProducts
  ) {
    const {
      error:
        productError
    } =
      await db
        .from(
          "application_products"
        )
        .insert({
          application_id:
            application.id,

          product_id:
            product
              .product_id,

          quantity_used:
            product
              .quantity_used
        });

    if (
      productError
    ) {
      await db
        .from(
          "application_products"
        )
        .delete()
        .eq(
          "application_id",
          application.id
        );

      await db
        .from(
          "applications"
        )
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

  document
    .querySelector(
      "#application_date"
    )
    .value =
    today();

  document
    .querySelector(
      "#application_time"
    )
    .value =
    currentTimeValue();

  document
    .querySelector(
      "#application_course"
    )
    .value =
    "Brampton Golf Club";

  document
    .querySelector(
      "#application-form"
    )
    .classList.add(
      "hidden"
    );

  await loadApplications();
}

/* =====================================================
   APPLICATION HISTORY
   ===================================================== */

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
  } =
    await db
      .from(
        "applications"
      )
      .select(`
        id,
        application_date,
        application_time,
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
          ascending:
            false
        }
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      );

  if (
    error
  ) {
    box.innerHTML = `
      <div class="empty">
        ${
          esc(
            error.message
          )
        }
      </div>
    `;

    return;
  }

  if (
    !data?.length
  ) {
    box.innerHTML = `
      <div class="empty">
        No applications yet.
      </div>
    `;

    return;
  }

  box.innerHTML =
    data
      .map(
        application => {
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
                  ${
                    formatDisplayDate(
                      application
                        .application_date
                    )
                  }

                  ${
                    application
                      .application_time
                      ? `
                        ·
                        ${formatTimeForDisplay(
                          application
                            .application_time
                        )}
                      `
                      : ""
                  }
                </h3>

                <p class="meta">
                  ${
                    esc(
                      [
                        application.course,
                        application.area,
                        application.holes
                      ]
                        .filter(
                          Boolean
                        )
                        .join(
                          " · "
                        )
                    )
                  }
                </p>

                <p>
                  ${
                    products
                      .map(
                        item => `
                          <span
                            class="tag"
                          >
                            ${
                              esc(
                                item
                                  .chemical_products
                                  ?.product_name ||
                                "Product"
                              )
                            }
                            —
                            ${
                              esc(
                                formatQuantity(
                                  item
                                    .quantity_used
                                )
                              )
                            }
                            ${
                              esc(
                                item
                                  .chemical_products
                                  ?.unit ||
                                ""
                              )
                            }
                          </span>
                        `
                      )
                      .join(" ")
                  }
                </p>

                ${
                  application
                    .applicator_name
                    ? `
                      <p>
                        Applicator:
                        ${
                          esc(
                            application
                              .applicator_name
                          )
                        }
                      </p>
                    `
                    : ""
                }

                ${
                  application
                    .tank_count !=
                    null
                    ? `
                      <p>
                        Tanks:
                        ${
                          esc(
                            formatQuantity(
                              application
                                .tank_count
                            )
                          )
                        }
                      </p>
                    `
                    : ""
                }

                ${
                  application
                    .temperature_c !=
                    null
                    ? `
                      <p class="meta">
                        Temperature:
                        ${
                          esc(
                            formatQuantity(
                              application
                                .temperature_c
                            )
                          )
                        }°C
                      </p>
                    `
                    : ""
                }

                ${
                  application
                    .wind_kmh !=
                    null
                    ? `
                      <p class="meta">
                        Wind:
                        ${
                          esc(
                            formatQuantity(
                              application
                                .wind_kmh
                            )
                          )
                        }
                        km/h
                      </p>
                    `
                    : ""
                }

                ${
                  application.notes
                    ? `
                      <p>
                        ${
                          esc(
                            application.notes
                          )
                        }
                      </p>
                    `
                    : ""
                }

              </div>

              <button
                class="delete delete-application"
                data-id="${
                  application.id
                }"
                type="button"
              >
                Delete
              </button>

            </article>
          `;
        }
      )
      .join("");

  box
    .querySelectorAll(
      ".delete-application"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          async () => {
            const appId =
              button
                .dataset
                .id;

            if (
              !confirm(
                "Delete this application? The products will be returned to inventory."
              )
            ) {
              return;
            }

            const {
              error:
                productDeleteError
            } =
              await db
                .from(
                  "application_products"
                )
                .delete()
                .eq(
                  "application_id",
                  appId
                );

            if (
              productDeleteError
            ) {
              alert(
                productDeleteError
                  .message
              );

              return;
            }

            const {
              error:
                applicationDeleteError
            } =
              await db
                .from(
                  "applications"
                )
                .delete()
                .eq(
                  "id",
                  appId
                );

            if (
              applicationDeleteError
            ) {
              alert(
                applicationDeleteError
                  .message
              );

              return;
            }

            await loadApplications();
          }
        );
      }
    );
}

/* =====================================================
   CHEMICAL INVENTORY
   ===================================================== */

async function renderChemicalInventory(
  page
) {
  const {
    data:
      products,
    error
  } =
    await db
      .from(
        "chemical_products"
      )
      .select("*")
      .eq(
        "active",
        true
      )
      .order(
        "product_name"
      );

  if (
    error
  ) {
    page.innerHTML = `
      <div class="heading">
        <h2>
          Chemical Inventory
        </h2>
      </div>

      <div class="empty">
        ${
          esc(
            error.message
          )
        }
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
        type="button"
      >
        + Add Product
      </button>

      <button
        id="show-receive-stock"
        class="primary"
        type="button"
      >
        + Receive Inventory
      </button>

      <button
        id="show-adjust-stock"
        class="primary"
        type="button"
      >
        Adjust Inventory
      </button>

      <button
        id="show-inventory-report"
        class="primary"
        type="button"
      >
        Monthly Inventory PDF
      </button>

    </div>

    ${
      addChemicalForm()
    }

    ${
      receiveInventoryForm(
        products
      )
    }

    ${
      adjustInventoryForm(
        products
      )
    }

    ${
      inventoryReportForm()
    }

    <section
      id="chemical-list"
      class="list"
    ></section>

    <h3
      style="
        margin-top:28px;
      "
    >
      Recent Inventory Activity
    </h3>

    <section
      id="inventory-history"
      class="list"
    ></section>
  `;

  document
    .querySelector(
      "#show-add-product"
    )
    .addEventListener(
      "click",
      () => {
        hideInventoryForms();

        document
          .querySelector(
            "#add-product-form"
          )
          .classList
          .remove(
            "hidden"
          );
      }
    );

  document
    .querySelector(
      "#show-receive-stock"
    )
    .addEventListener(
      "click",
      () => {
        hideInventoryForms();

        document
          .querySelector(
            "#receive-stock-form"
          )
          .classList
          .remove(
            "hidden"
          );
      }
    );

  document
    .querySelector(
      "#show-adjust-stock"
    )
    .addEventListener(
      "click",
      () => {
        hideInventoryForms();

        document
          .querySelector(
            "#adjust-stock-form"
          )
          .classList
          .remove(
            "hidden"
          );
      }
    );

  document
    .querySelector(
      "#show-inventory-report"
    )
    .addEventListener(
      "click",
      () => {
        hideInventoryForms();

        document
          .querySelector(
            "#inventory-report-form"
          )
          .classList
          .remove(
            "hidden"
          );
      }
    );

  document
    .querySelector(
      "#add-product-form"
    )
    .addEventListener(
      "submit",
      saveNewChemical
    );

  document
    .querySelector(
      "#receive-stock-form"
    )
    .addEventListener(
      "submit",
      receiveInventory
    );

  document
    .querySelector(
      "#adjust-stock-form"
    )
    .addEventListener(
      "submit",
      adjustInventory
    );

  document
    .querySelector(
      "#inventory-report-form"
    )
    .addEventListener(
      "submit",
      generateInventoryPdf
    );

  renderChemicalCards(
    products
  );

  await loadInventoryHistory();
}

function hideInventoryForms() {
  [
    "#add-product-form",
    "#receive-stock-form",
    "#adjust-stock-form",
    "#inventory-report-form"
  ].forEach(
    selector => {
      document
        .querySelector(
          selector
        )
        ?.classList.add(
          "hidden"
        );
    }
  );
}

/* =====================================================
   MONTHLY INVENTORY PDF
   ===================================================== */

function inventoryReportForm() {
  return `
    <form
      id="inventory-report-form"
      class="form hidden"
    >

      <h3>
        Monthly Inventory Report
      </h3>

      <p class="meta">
        Choose a month to generate
        the month-end inventory PDF.
      </p>

      <div
        class="form-grid"
      >

        <label>
          Report Month

          <input
            id="inventory-report-month"
            type="month"
            required
            value="${
              today()
                .slice(
                  0,
                  7
                )
            }"
          >
        </label>

      </div>

      <button
        id="generate-inventory-pdf"
        type="submit"
        class="primary"
      >
        Generate PDF
      </button>

      <p
        id="inventory-report-message"
      ></p>

    </form>
  `;
}

async function generateInventoryPdf(
  event
) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#inventory-report-message"
    );

  const button =
    document.querySelector(
      "#generate-inventory-pdf"
    );

  const monthValue =
    document.querySelector(
      "#inventory-report-month"
    ).value;

  if (
    !monthValue
  ) {
    message.textContent =
      "Choose a month.";

    return;
  }

  message.textContent =
    "Building report…";

  button.disabled =
    true;

  let previewWindow =
    null;

  try {
    previewWindow =
      window.open(
        "",
        "_blank"
      );

    const [
      year,
      month
    ] =
      monthValue
        .split("-")
        .map(Number);

    const startDate =
      `${year}-${String(
        month
      ).padStart(
        2,
        "0"
      )}-01`;

    let nextYear =
      year;

    let nextMonth =
      month + 1;

    if (
      nextMonth ===
      13
    ) {
      nextMonth =
        1;

      nextYear++;
    }

    const nextMonthDate =
      `${nextYear}-${String(
        nextMonth
      ).padStart(
        2,
        "0"
      )}-01`;

    const monthEnd =
      new Date(
        year,
        month,
        0
      );

    const monthEndText =
      monthEnd
        .toLocaleDateString(
          "en-CA",
          {
            month:
              "long",
            day:
              "numeric",
            year:
              "numeric"
          }
        );

    const monthName =
      monthEnd
        .toLocaleDateString(
          "en-CA",
          {
            month:
              "long",
            year:
              "numeric"
          }
        );

    const [
      productResult,
      transactionResult
    ] =
      await Promise.all([
        db
          .from(
            "chemical_products"
          )
          .select(`
            id,
            product_name,
            product_type,
            unit,
            active
          `)
          .order(
            "product_name"
          ),

        db
          .from(
            "inventory_transactions"
          )
          .select(`
            id,
            product_id,
            transaction_type,
            quantity_change,
            transaction_date
          `)
          .lt(
            "transaction_date",
            nextMonthDate
          )
          .order(
            "transaction_date",
            {
              ascending:
                true
            }
          )
      ]);

    if (
      productResult.error
    ) {
      throw productResult.error;
    }

    if (
      transactionResult.error
    ) {
      throw transactionResult.error;
    }

    const products =
      productResult.data ||
      [];

    const transactions =
      transactionResult.data ||
      [];

    const reportRows =
      [];

    products.forEach(
      product => {
        const productTransactions =
          transactions.filter(
            transaction =>
              transaction.product_id ===
              product.id
          );

        let opening =
          0;

        let received =
          0;

        let applied =
          0;

        let adjustments =
          0;

        let ending =
          0;

        productTransactions.forEach(
          transaction => {
            const amount =
              Number(
                transaction
                  .quantity_change ||
                0
              );

            const date =
              transaction
                .transaction_date;

            ending +=
              amount;

            if (
              date <
              startDate
            ) {
              opening +=
                amount;

              return;
            }

            if (
              transaction
                .transaction_type ===
              "delivery"
            ) {
              received +=
                amount;

              return;
            }

            if (
              transaction
                .transaction_type ===
              "application"
            ) {
              applied +=
                Math.abs(
                  amount
                );

              return;
            }

            adjustments +=
              amount;
          }
        );

        const hadMonthActivity =
          productTransactions.some(
            transaction =>
              transaction
                .transaction_date >=
                startDate &&
              transaction
                .transaction_date <
                nextMonthDate
          );

        const shouldInclude =
          Math.abs(
            opening
          ) >
            0.000001 ||
          Math.abs(
            ending
          ) >
            0.000001 ||
          hadMonthActivity;

        if (
          !shouldInclude
        ) {
          return;
        }

        reportRows.push({
          product_name:
            product.product_name,

          product_type:
            product.product_type ||
            "other",

          unit:
            product.unit ||
            "",

          opening,
          received,
          applied,
          adjustments,
          ending
        });
      }
    );

    if (
      !reportRows.length
    ) {
      if (
        previewWindow
      ) {
        previewWindow.close();
      }

      message.textContent =
        "No inventory records were found for that month.";

      return;
    }

    await ensurePdfLibraries();

    const {
      jsPDF
    } =
      window.jspdf;

    const doc =
      new jsPDF({
        orientation:
          "landscape",

        unit:
          "pt",

        format:
          "letter"
      });

    const pageWidth =
      doc.internal
        .pageSize
        .getWidth();

    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.setFontSize(
      18
    );

    doc.text(
      "BRAMPTON GOLF CLUB",
      pageWidth /
        2,
      40,
      {
        align:
          "center"
      }
    );

    doc.setFontSize(
      14
    );

    doc.text(
      "Chemical Inventory — Month End Report",
      pageWidth /
        2,
      62,
      {
        align:
          "center"
      }
    );

    doc.setFont(
      "helvetica",
      "normal"
    );

    doc.setFontSize(
      10
    );

    doc.text(
      `Inventory as of ${monthEndText}`,
      pageWidth /
        2,
      80,
      {
        align:
          "center"
      }
    );

    let currentY =
      105;

    const typeOrder = [
      "fungicide",
      "herbicide",
      "insecticide",
      "fertilizer",
      "wetting_agent",
      "growth_regulator",
      "other"
    ];

    const typeLabels = {
      fungicide:
        "FUNGICIDES",

      herbicide:
        "HERBICIDES",

      insecticide:
        "INSECTICIDES",

      fertilizer:
        "FERTILIZERS",

      wetting_agent:
        "WETTING AGENTS",

      growth_regulator:
        "GROWTH REGULATORS",

      other:
        "OTHER"
    };

    const existingTypes =
      [
        ...new Set(
          reportRows.map(
            item =>
              item.product_type ||
              "other"
          )
        )
      ];

    const orderedTypes = [
      ...typeOrder.filter(
        type =>
          existingTypes.includes(
            type
          )
      ),

      ...existingTypes.filter(
        type =>
          !typeOrder.includes(
            type
          )
      )
    ];

    for (
      const type
      of orderedTypes
    ) {
      const group =
        reportRows
          .filter(
            item =>
              (
                item.product_type ||
                "other"
              ) ===
              type
          )
          .sort(
            (a, b) =>
              a.product_name
                .localeCompare(
                  b.product_name
                )
          );

      if (
        !group.length
      ) {
        continue;
      }

      if (
        currentY >
        doc.internal
          .pageSize
          .getHeight() -
          100
      ) {
        doc.addPage();

        currentY =
          45;
      }

      doc.setFont(
        "helvetica",
        "bold"
      );

      doc.setFontSize(
        11
      );

      doc.text(
        typeLabels[
          type
        ] ||
          humanize(
            type
          ).toUpperCase(),
        40,
        currentY
      );

      currentY +=
        8;

      doc.autoTable({
        startY:
          currentY,

        margin: {
          left:
            40,
          right:
            40
        },

        head: [[
          "Product",
          "Opening",
          "Received",
          "Applied",
          "Adjustments",
          "Ending"
        ]],

        body:
          group.map(
            product => [
              product
                .product_name,

              formatPdfQuantity(
                product.opening,
                product.unit
              ),

              formatPdfSignedQuantity(
                product.received,
                product.unit
              ),

              product.applied ===
              0
                ? formatPdfQuantity(
                    0,
                    product.unit
                  )
                : `-${formatPdfQuantity(
                    product.applied,
                    product.unit
                  )}`,

              formatPdfSignedQuantity(
                product.adjustments,
                product.unit
              ),

              formatPdfQuantity(
                product.ending,
                product.unit
              )
            ]
          ),

        styles: {
          fontSize:
            9,

          cellPadding:
            5
        },

        headStyles: {
          fillColor: [
            0,
            103,
            71
          ],

          textColor: [
            255,
            255,
            255
          ],

          fontStyle:
            "bold"
        },

        alternateRowStyles: {
          fillColor: [
            245,
            247,
            246
          ]
        },

        columnStyles: {
          0: {
            cellWidth:
              210
          }
        },

        didDrawPage:
          () => {
            const height =
              doc.internal
                .pageSize
                .getHeight();

            doc.setFontSize(
              8
            );

            doc.setFont(
              "helvetica",
              "normal"
            );

            doc.text(
              `Brampton Golf Club · ${monthName}`,
              40,
              height -
                20
            );

            doc.text(
              `Page ${doc.internal.getNumberOfPages()}`,
              pageWidth -
                40,
              height -
                20,
              {
                align:
                  "right"
              }
            );
          }
      });

      currentY =
        doc.lastAutoTable
          .finalY +
        24;
    }

    const blob =
      doc.output(
        "blob"
      );

    const blobUrl =
      URL.createObjectURL(
        blob
      );

    if (
      previewWindow &&
      !previewWindow.closed
    ) {
      previewWindow.location.href =
        blobUrl;
    } else {
      doc.save(
        `Brampton-Golf-Club-Inventory-${monthValue}.pdf`
      );
    }

    setTimeout(
      () => {
        URL.revokeObjectURL(
          blobUrl
        );
      },
      60000
    );

    message.textContent =
      `PDF created for ${monthName}.`;

  } catch (error) {
    if (
      previewWindow &&
      !previewWindow.closed
    ) {
      previewWindow.close();
    }

    console.error(
      error
    );

    message.textContent =
      error?.message ||
      "Could not generate the PDF.";

  } finally {
    button.disabled =
      false;
  }
}

function formatPdfQuantity(
  amount,
  unit
) {
  return (
    `${formatQuantity(
      amount
    )}` +
    `${
      unit
        ? ` ${unit}`
        : ""
    }`
  );
}

function formatPdfSignedQuantity(
  amount,
  unit
) {
  const number =
    Number(
      amount ||
      0
    );

  const sign =
    number >
    0
      ? "+"
      : "";

  return (
    `${sign}${formatQuantity(
      number
    )}` +
    `${
      unit
        ? ` ${unit}`
        : ""
    }`
  );
}

async function ensurePdfLibraries() {
  if (
    !window.jspdf
  ) {
    await loadExternalScript(
      "jspdf-library",
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
    );
  }

  if (
    !window.jspdf ||
    !window.jspdf.jsPDF
  ) {
    throw new Error(
      "PDF library could not be loaded."
    );
  }

  const testDoc =
    new window.jspdf
      .jsPDF();

  if (
    typeof testDoc.autoTable !==
    "function"
  ) {
    await loadExternalScript(
      "jspdf-autotable-library",
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"
    );
  }

  const secondTestDoc =
    new window.jspdf
      .jsPDF();

  if (
    typeof secondTestDoc.autoTable !==
    "function"
  ) {
    throw new Error(
      "PDF table library could not be loaded."
    );
  }
}

function loadExternalScript(
  id,
  src
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const existing =
        document
          .getElementById(
            id
          );

      if (
        existing &&
        existing.dataset.loaded ===
          "true"
      ) {
        resolve();

        return;
      }

      if (
        existing
      ) {
        existing
          .addEventListener(
            "load",
            resolve,
            {
              once:
                true
            }
          );

        existing
          .addEventListener(
            "error",
            () =>
              reject(
                new Error(
                  "Could not load PDF library."
                )
              ),
            {
              once:
                true
            }
          );

        return;
      }

      const script =
        document
          .createElement(
            "script"
          );

      script.id =
        id;

      script.src =
        src;

      script.async =
        true;

      script.onload =
        () => {
          script.dataset.loaded =
            "true";

          resolve();
        };

      script.onerror =
        () => {
          reject(
            new Error(
              "Could not load PDF library."
            )
          );
        };

      document.head
        .appendChild(
          script
        );
    }
  );
}

/* =====================================================
   CHEMICAL FORMS
   ===================================================== */

function addChemicalForm() {
  return `
    <form
      id="add-product-form"
      class="form hidden"
    >

      <h3>
        Add Chemical Product
      </h3>

      <div
        class="form-grid"
      >

        <label>
          Product Name

          <input
            id="new_product_name"
            required
          >
        </label>

        <label>
          Product Type

          <select
            id="new_product_type"
          >

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

          <select
            id="new_unit"
          >

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
        New products start at
        0 inventory. Use Receive
        Inventory after creating
        the product.
      </p>

      <button
        type="submit"
        class="primary"
      >
        Add Product
      </button>

      <p
        id="add-product-message"
      ></p>

    </form>
  `;
}

async function saveNewChemical(
  event
) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#add-product-message"
    );

  message.textContent =
    "";

  const payload = {
    product_name:
      document
        .querySelector(
          "#new_product_name"
        )
        .value
        .trim(),

    product_type:
      nullable(
        "new_product_type"
      ),

    manufacturer:
      nullable(
        "new_manufacturer"
      ),

    quantity:
      0,

    unit:
      document
        .querySelector(
          "#new_unit"
        )
        .value,

    storage_location:
      nullable(
        "new_storage_location"
      ),

    reorder_level:
      nullableNumber(
        "new_reorder_level"
      ),

    active:
      true
  };

  const {
    error
  } =
    await db
      .from(
        "chemical_products"
      )
      .insert(
        payload
      );

  if (
    error
  ) {
    message.textContent =
      error.message;

    return;
  }

  await renderChemicalInventory(
    document.querySelector(
      "#page"
    )
  );
}

function receiveInventoryForm(
  products
) {
  return `
    <form
      id="receive-stock-form"
      class="form hidden"
    >

      <h3>
        Receive Inventory
      </h3>

      <div
        class="form-grid"
      >

        <label>
          Product

          <select
            id="receive_product_id"
            required
          >

            <option value="">
              Choose product…
            </option>

            ${
              productOptions(
                products
              )
            }

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

      <p
        id="receive-message"
      ></p>

    </form>
  `;
}

async function receiveInventory(
  event
) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#receive-message"
    );

  message.textContent =
    "";

  const quantity =
    Number(
      document
        .querySelector(
          "#receive_quantity"
        )
        .value
    );

  if (
    !Number.isFinite(
      quantity
    ) ||
    quantity <=
      0
  ) {
    message.textContent =
      "Quantity must be greater than zero.";

    return;
  }

  const payload = {
    product_id:
      document
        .querySelector(
          "#receive_product_id"
        )
        .value,

    transaction_type:
      "delivery",

    quantity_change:
      quantity,

    transaction_date:
      document
        .querySelector(
          "#receive_date"
        )
        .value,

    supplier:
      nullable(
        "receive_supplier"
      ),

    reason:
      "Inventory received",

    notes:
      nullable(
        "receive_notes"
      )
  };

  const {
    error
  } =
    await db
      .from(
        "inventory_transactions"
      )
      .insert(
        payload
      );

  if (
    error
  ) {
    message.textContent =
      error.message;

    return;
  }

  await renderChemicalInventory(
    document.querySelector(
      "#page"
    )
  );
}

function adjustInventoryForm(
  products
) {
  return `
    <form
      id="adjust-stock-form"
      class="form hidden"
    >

      <h3>
        Adjust Inventory
      </h3>

      <p class="meta">
        Enter a positive number
        to add inventory. Enter a
        negative number to remove
        inventory.
      </p>

      <div
        class="form-grid"
      >

        <label>
          Product

          <select
            id="adjust_product_id"
            required
          >

            <option value="">
              Choose product…
            </option>

            ${
              productOptions(
                products
              )
            }

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

          <select
            id="adjust_reason"
          >

            <option
              value="Physical count correction"
            >
              Physical count correction
            </option>

            <option
              value="Spill / waste"
            >
              Spill / waste
            </option>

            <option
              value="Damaged container"
            >
              Damaged container
            </option>

            <option
              value="Returned product"
            >
              Returned product
            </option>

            <option
              value="Transfer"
            >
              Transfer
            </option>

            <option
              value="Other"
            >
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

      <p
        id="adjust-message"
      ></p>

    </form>
  `;
}

async function adjustInventory(
  event
) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#adjust-message"
    );

  message.textContent =
    "";

  const quantity =
    Number(
      document
        .querySelector(
          "#adjust_quantity"
        )
        .value
    );

  if (
    !Number.isFinite(
      quantity
    ) ||
    quantity ===
      0
  ) {
    message.textContent =
      "Adjustment cannot be zero.";

    return;
  }

  const payload = {
    product_id:
      document
        .querySelector(
          "#adjust_product_id"
        )
        .value,

    transaction_type:
      "adjustment",

    quantity_change:
      quantity,

    transaction_date:
      document
        .querySelector(
          "#adjust_date"
        )
        .value,

    reason:
      document
        .querySelector(
          "#adjust_reason"
        )
        .value,

    notes:
      nullable(
        "adjust_notes"
      )
  };

  const {
    error
  } =
    await db
      .from(
        "inventory_transactions"
      )
      .insert(
        payload
      );

  if (
    error
  ) {
    message.textContent =
      error.message;

    return;
  }

  await renderChemicalInventory(
    document.querySelector(
      "#page"
    )
  );
}

/* =====================================================
   CHEMICAL CARDS
   ===================================================== */

function renderChemicalCards(
  products
) {
  const box =
    document.querySelector(
      "#chemical-list"
    );

  if (
    !products?.length
  ) {
    box.innerHTML = `
      <div class="empty">
        No chemicals in inventory.
      </div>
    `;

    return;
  }

  box.innerHTML =
    products
      .map(
        product => {
          const low =
            product
              .reorder_level !=
              null &&
            Number(
              product.quantity
            ) <=
            Number(
              product.reorder_level
            );

          return `
            <article
              class="card row"
            >

              <div>

                <h3>
                  ${
                    esc(
                      product
                        .product_name
                    )
                  }
                </h3>

                <p>

                  <span
                    class="tag"
                  >
                    ${
                      esc(
                        formatQuantity(
                          product.quantity ??
                          0
                        )
                      )
                    }
                    ${
                      esc(
                        product.unit ||
                        ""
                      )
                    }
                  </span>

                  ${
                    low
                      ? `
                        <span
                          class="tag"
                        >
                          LOW STOCK
                        </span>
                      `
                      : ""
                  }

                </p>

                <p class="meta">
                  ${
                    esc(
                      [
                        product.product_type,
                        product.manufacturer,
                        product.storage_location
                      ]
                        .filter(
                          Boolean
                        )
                        .join(
                          " · "
                        )
                    )
                  }
                </p>

                ${
                  product
                    .reorder_level !=
                    null
                    ? `
                      <p class="meta">
                        Low stock warning:
                        ${
                          esc(
                            formatQuantity(
                              product
                                .reorder_level
                            )
                          )
                        }
                        ${
                          esc(
                            product.unit ||
                            ""
                          )
                        }
                      </p>
                    `
                    : ""
                }

              </div>

              <button
                class="delete remove-chemical"
                data-id="${
                  product.id
                }"
                type="button"
              >
                Delete
              </button>

            </article>
          `;
        }
      )
      .join("");

  box
    .querySelectorAll(
      ".remove-chemical"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          async () => {
            if (
              !confirm(
                "Remove this product from current inventory? Old application records will be kept."
              )
            ) {
              return;
            }

            const {
              error
            } =
              await db
                .from(
                  "chemical_products"
                )
                .update({
                  active:
                    false
                })
                .eq(
                  "id",
                  button
                    .dataset
                    .id
                );

            if (
              error
            ) {
              alert(
                error.message
              );

              return;
            }

            await renderChemicalInventory(
              document
                .querySelector(
                  "#page"
                )
            );
          }
        );
      }
    );
}

/* =====================================================
   INVENTORY HISTORY
   ===================================================== */

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
  } =
    await db
      .from(
        "inventory_transactions"
      )
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
          ascending:
            false
        }
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      )
      .limit(
        50
      );

  if (
    error
  ) {
    box.innerHTML = `
      <div class="empty">
        ${
          esc(
            error.message
          )
        }
      </div>
    `;

    return;
  }

  if (
    !data?.length
  ) {
    box.innerHTML = `
      <div class="empty">
        No inventory activity yet.
      </div>
    `;

    return;
  }

  box.innerHTML =
    data
      .map(
        transaction => {
          const product =
            transaction
              .chemical_products;

          const change =
            Number(
              transaction
                .quantity_change
            );

          return `
            <article
              class="card"
            >

              <h3>
                ${
                  esc(
                    product
                      ?.product_name ||
                    "Product"
                  )
                }
              </h3>

              <p>
                <span
                  class="tag"
                >

                  ${
                    change >
                    0
                      ? "+"
                      : ""
                  }

                  ${
                    esc(
                      formatQuantity(
                        change
                      )
                    )
                  }

                  ${
                    esc(
                      product
                        ?.unit ||
                      ""
                    )
                  }

                </span>
              </p>

              <p class="meta">
                ${
                  esc(
                    transaction
                      .transaction_date
                  )
                }
                ·
                ${
                  esc(
                    humanize(
                      transaction
                        .transaction_type
                    )
                  )
                }
              </p>

              ${
                transaction
                  .supplier
                  ? `
                    <p>
                      Supplier:
                      ${
                        esc(
                          transaction
                            .supplier
                        )
                      }
                    </p>
                  `
                  : ""
              }

              ${
                transaction
                  .reason
                  ? `
                    <p>
                      ${
                        esc(
                          transaction
                            .reason
                        )
                      }
                    </p>
                  `
                  : ""
              }

              ${
                transaction
                  .notes
                  ? `
                    <p class="meta">
                      ${
                        esc(
                          transaction
                            .notes
                        )
                      }
                    </p>
                  `
                  : ""
              }

            </article>
          `;
        }
      )
      .join("");
}

function productOptions(
  products
) {
  return products
    .map(
      product => `
        <option
          value="${product.id}"
        >
          ${
            esc(
              product
                .product_name
            )
          }
          —
          ${
            esc(
              formatQuantity(
                product.quantity ??
                0
              )
            )
          }
          ${
            esc(
              product.unit ||
              ""
            )
          }
        </option>
      `
    )
    .join("");
}

/* =====================================================
   STAFF
   ===================================================== */

async function renderStaff(
  page
) {
  const canEdit =
    canCurrentUserEditProfiles();

  page.innerHTML = `
    <div class="heading">

      <h2>
        Staff
      </h2>

      ${
        canEdit
          ? `
            <span
              class="tag"
            >
              Profile editing enabled
            </span>
          `
          : ""
      }

    </div>

    ${
      canEdit
        ? `
          <form
            id="staff-edit-form"
            class="form hidden"
          >

            <h3>
              Edit Staff Profile
            </h3>

            <input
              id="staff-edit-id"
              type="hidden"
            >

            <div
              class="form-grid"
            >

              <label>
                Full Name

                <input
                  id="staff-edit-name"
                  type="text"
                >
              </label>

              <label>
                Email

                <input
                  id="staff-edit-email"
                  type="email"
                  readonly
                >
              </label>

              <label>
                Phone

                <input
                  id="staff-edit-phone"
                  type="tel"
                >
              </label>

              <label>
                Position

                <input
                  id="staff-edit-position"
                  type="text"
                >
              </label>

              <label>
                Role

                <select
                  id="staff-edit-role"
                  required
                >

                  <option
                    value="admin"
                  >
                    Admin
                  </option>

                  <option
                    value="superintendent"
                  >
                    Superintendent
                  </option>

                  <option
                    value="assistant"
                  >
                    Assistant
                  </option>

                  <option
                    value="mechanic"
                  >
                    Mechanic
                  </option>

                  <option
                    value="applicator"
                  >
                    Applicator
                  </option>

                  <option
                    value="crew"
                  >
                    Crew
                  </option>

                  <option
                    value="read_only"
                  >
                    Read Only
                  </option>

                </select>
              </label>

            </div>

            <p class="meta">
              Email is controlled by
              the user's Supabase
              Authentication account
              and cannot be changed
              here.
            </p>

            <div
              style="
                display:flex;
                gap:10px;
                flex-wrap:wrap;
              "
            >

              <button
                type="submit"
                class="primary"
              >
                Save Changes
              </button>

              <button
                id="cancel-staff-edit"
                type="button"
              >
                Cancel
              </button>

            </div>

            <p
              id="staff-edit-message"
            ></p>

          </form>
        `
        : ""
    }

    <section
      id="staff-list"
      class="list"
    ></section>
  `;

  if (
    canEdit
  ) {
    document
      .querySelector(
        "#staff-edit-form"
      )
      .addEventListener(
        "submit",
        saveStaffProfile
      );

    document
      .querySelector(
        "#cancel-staff-edit"
      )
      .addEventListener(
        "click",
        closeStaffEditForm
      );
  }

  await loadStaffCards();
}

async function loadStaffCards() {
  const box =
    document.querySelector(
      "#staff-list"
    );

  if (
    !box
  ) {
    return;
  }

  box.innerHTML = `
    <div class="empty">
      Loading staff…
    </div>
  `;

  const {
    data,
    error
  } =
    await db
      .from(
        "profiles"
      )
      .select(`
        id,
        full_name,
        email,
        phone,
        position,
        role,
        active
      `)
      .order(
        "full_name"
      );

  if (
    error
  ) {
    box.innerHTML = `
      <div class="empty">
        ${
          esc(
            error.message
          )
        }
      </div>
    `;

    return;
  }

  if (
    !data?.length
  ) {
    box.innerHTML = `
      <div class="empty">
        No staff found.
      </div>
    `;

    return;
  }

  const canEdit =
    canCurrentUserEditProfiles();

  box.innerHTML =
    data
      .map(
        row => `
          <article
            class="card row"
          >

            <div>

              <h3>
                ${
                  esc(
                    row.full_name ||
                    row.email ||
                    "Staff"
                  )
                }
              </h3>

              <p>
                <span
                  class="tag"
                >
                  ${
                    esc(
                      row.position ||
                      humanize(
                        row.role ||
                        "crew"
                      )
                    )
                  }
                </span>

                ${
                  row.position &&
                  row.role
                    ? `
                      <span
                        class="tag"
                      >
                        ${
                          esc(
                            humanize(
                              row.role
                            )
                          )
                        }
                      </span>
                    `
                    : ""
                }
              </p>

              <p class="meta">
                ${
                  esc(
                    [
                      row.phone,
                      row.email
                    ]
                      .filter(
                        Boolean
                      )
                      .join(
                        " · "
                      )
                  )
                }
              </p>

            </div>

            ${
              canEdit
                ? `
                  <button
                    class="primary edit-staff-profile"
                    data-id="${
                      row.id
                    }"
                    type="button"
                  >
                    Edit
                  </button>
                `
                : ""
            }

          </article>
        `
      )
      .join("");

  if (
    !canEdit
  ) {
    return;
  }

  box
    .querySelectorAll(
      ".edit-staff-profile"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            const profile =
              data.find(
                item =>
                  String(
                    item.id
                  ) ===
                  String(
                    button
                      .dataset
                      .id
                  )
              );

            if (
              profile
            ) {
              openStaffEditForm(
                profile
              );
            }
          }
        );
      }
    );
}

function openStaffEditForm(
  profile
) {
  if (
    !canCurrentUserEditProfiles()
  ) {
    return;
  }

  const form =
    document.querySelector(
      "#staff-edit-form"
    );

  if (
    !form
  ) {
    return;
  }

  document
    .querySelector(
      "#staff-edit-id"
    )
    .value =
    profile.id;

  document
    .querySelector(
      "#staff-edit-name"
    )
    .value =
    profile.full_name ||
    "";

  document
    .querySelector(
      "#staff-edit-email"
    )
    .value =
    profile.email ||
    "";

  document
    .querySelector(
      "#staff-edit-phone"
    )
    .value =
    profile.phone ||
    "";

  document
    .querySelector(
      "#staff-edit-position"
    )
    .value =
    profile.position ||
    "";

  document
    .querySelector(
      "#staff-edit-role"
    )
    .value =
    profile.role ||
    "crew";

  document
    .querySelector(
      "#staff-edit-message"
    )
    .textContent =
    "";

  form
    .classList
    .remove(
      "hidden"
    );

  form.scrollIntoView({
    behavior:
      "smooth",

    block:
      "start"
  });
}

function closeStaffEditForm() {
  const form =
    document.querySelector(
      "#staff-edit-form"
    );

  if (
    !form
  ) {
    return;
  }

  form.reset();

  form
    .classList
    .add(
      "hidden"
    );

  const message =
    document.querySelector(
      "#staff-edit-message"
    );

  if (
    message
  ) {
    message.textContent =
      "";
  }
}

async function saveStaffProfile(
  event
) {
  event.preventDefault();

  const message =
    document.querySelector(
      "#staff-edit-message"
    );

  if (
    !canCurrentUserEditProfiles()
  ) {
    message.textContent =
      "You do not have permission to edit staff profiles.";

    return;
  }

  const id =
    document
      .querySelector(
        "#staff-edit-id"
      )
      .value;

  if (
    !id
  ) {
    message.textContent =
      "No staff profile selected.";

    return;
  }

  const role =
    document
      .querySelector(
        "#staff-edit-role"
      )
      .value;

  const validRoles = [
    "admin",
    "superintendent",
    "assistant",
    "mechanic",
    "applicator",
    "crew",
    "read_only"
  ];

  if (
    !validRoles.includes(
      role
    )
  ) {
    message.textContent =
      "Invalid staff role.";

    return;
  }

  message.textContent =
    "Saving…";

  const payload = {
    full_name:
      nullable(
        "staff-edit-name"
      ),

    phone:
      nullable(
        "staff-edit-phone"
      ),

    position:
      nullable(
        "staff-edit-position"
      ),

    role
  };

  const {
    error
  } =
    await db
      .from(
        "profiles"
      )
      .update(
        payload
      )
      .eq(
        "id",
        id
      );

  if (
    error
  ) {
    message.textContent =
      error.message;

    return;
  }

  /*
    If the logged-in user edited
    their own profile, refresh their
    role immediately.
  */

  if (
    state.currentProfile?.id ===
    id
  ) {
    await loadCurrentProfile(
      id
    );
  }

  closeStaffEditForm();

  await renderStaff(
    document.querySelector(
      "#page"
    )
  );
}

/* =====================================================
   STANDARD CRUD PAGE SPECS
   ===================================================== */

const specs = {
  tasks: {
    title:
      "Tasks",

    table:
      "tasks",

    order:
      "created_at",

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
        "Assigned To",
        "text"
      ],

      [
        "priority",
        "Priority",
        "select",
        [
          [
            "low",
            "Low"
          ],
          [
            "medium",
            "Medium"
          ],
          [
            "high",
            "High"
          ],
          [
            "urgent",
            "Urgent"
          ]
        ]
      ],

      [
        "status",
        "Status",
        "select",
        [
          [
            "open",
            "Open"
          ],
          [
            "in_progress",
            "In Progress"
          ],
          [
            "done",
            "Done"
          ]
        ]
      ],

      [
        "due_date",
        "Due Date",
        "date"
      ],

      [
        "description",
        "Description",
        "textarea"
      ]
    ],

    display:
      row => `
        <h3>
          ${
            esc(
              row.title
            )
          }
        </h3>

        <p class="meta">
          ${
            esc(
              [
                row.course,
                row.area,
                row.assigned_to
              ]
                .filter(
                  Boolean
                )
                .join(
                  " · "
                )
            )
          }
        </p>

        ${
          row.description
            ? `
              <p>
                ${
                  esc(
                    row.description
                  )
                }
              </p>
            `
            : ""
        }

        <p>

          <span
            class="tag"
          >
            ${
              esc(
                humanize(
                  row.priority ||
                  "medium"
                )
              )
            }
          </span>

          <span
            class="tag"
          >
            ${
              esc(
                humanize(
                  row.status ||
                  "open"
                )
              )
            }
          </span>

        </p>
      `
  },

  jobs: {
    title:
      "Job Board",

    table:
      "jobs",

    order:
      "created_at",

    fields: [
      [
        "title",
        "Title",
        "text"
      ],

      [
        "job_type",
        "Job Type",
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
        "Assigned To",
        "text"
      ],

      [
        "priority",
        "Priority",
        "select",
        [
          [
            "low",
            "Low"
          ],
          [
            "medium",
            "Medium"
          ],
          [
            "high",
            "High"
          ],
          [
            "urgent",
            "Urgent"
          ]
        ]
      ],

      [
        "status",
        "Status",
        "select",
        [
          [
            "open",
            "Open"
          ],
          [
            "in_progress",
            "In Progress"
          ],
          [
            "done",
            "Done"
          ]
        ]
      ],

      [
        "due_date",
        "Due Date",
        "date"
      ],

      [
        "description",
        "Description",
        "textarea"
      ]
    ],

    display:
      row => `
        <h3>
          ${
            esc(
              row.title
            )
          }
        </h3>

        <p class="meta">
          ${
            esc(
              [
                row.job_type,
                row.course,
                row.area,
                row.assigned_to
              ]
                .filter(
                  Boolean
                )
                .join(
                  " · "
                )
            )
          }
        </p>

        ${
          row.description
            ? `
              <p>
                ${
                  esc(
                    row.description
                  )
                }
              </p>
            `
            : ""
        }

        <p>
          <span
            class="tag"
          >
            ${
              esc(
                humanize(
                  row.status ||
                  "open"
                )
              )
            }
          </span>
        </p>
      `
  },

  calendar: {
    title:
      "Calendar",

    table:
      "calendar_entries",

    order:
      "start_date",

    fields: [
      [
        "title",
        "Title",
        "text"
      ],

      [
        "entry_type",
        "Entry Type",
        "select",
        [
          [
            "event",
            "Event"
          ],

          [
            "staff_day_off",
            "Staff Day Off"
          ],

          [
            "maintenance",
            "Maintenance"
          ],

          [
            "tournament",
            "Tournament"
          ],

          [
            "delivery",
            "Delivery"
          ],

          [
            "other",
            "Other"
          ]
        ]
      ],

      [
        "start_date",
        "Start Date",
        "date"
      ],

      [
        "end_date",
        "End Date",
        "date"
      ],

      [
        "staff_member",
        "Staff Member",
        "text"
      ],

      [
        "description",
        "Description",
        "textarea"
      ]
    ],

    display:
      row => `
        <h3>
          ${
            esc(
              row.title
            )
          }
        </h3>

        <p class="meta">

          ${
            esc(
              row.start_date
            )
          }

          ${
            row.end_date
              ? `
                –
                ${
                  esc(
                    row.end_date
                  )
                }
              `
              : ""
          }

          ·

          ${
            esc(
              humanize(
                row.entry_type ||
                "event"
              )
            )
          }

        </p>

        ${
          row.staff_member
            ? `
              <p>
                Staff:
                ${
                  esc(
                    row.staff_member
                  )
                }
              </p>
            `
            : ""
        }

        ${
          row.description
            ? `
              <p>
                ${
                  esc(
                    row.description
                  )
                }
              </p>
            `
            : ""
        }
      `
  },

  equipment: {
    title:
      "Equipment",

    table:
      "equipment",

    order:
      "equipment_name",

    fields: [
      [
        "equipment_name",
        "Equipment Name",
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
        "Fleet Number",
        "text"
      ],

      [
        "serial_number",
        "Serial Number",
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
            "Needs Repair"
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
        "Next Service Date",
        "date"
      ],

      [
        "notes",
        "Notes",
        "textarea"
      ]
    ],

    display:
      row => `
        <h3>
          ${
            esc(
              row.equipment_name
            )
          }
        </h3>

        <p class="meta">
          ${
            esc(
              [
                row.manufacturer,
                row.model,

                row.fleet_number
                  ? `Fleet #${row.fleet_number}`
                  : null
              ]
                .filter(
                  Boolean
                )
                .join(
                  " · "
                )
            )
          }
        </p>

        <p>
          <span
            class="tag"
          >
            ${
              esc(
                humanize(
                  row.status ||
                  "operational"
                )
              )
            }
          </span>
        </p>

        ${
          row.hours !=
          null
            ? `
              <p>
                Hours:
                ${
                  esc(
                    formatQuantity(
                      row.hours
                    )
                  )
                }
              </p>
            `
            : ""
        }

        ${
          row
            .next_service_date
            ? `
              <p>
                Next Service:
                ${
                  esc(
                    row
                      .next_service_date
                  )
                }
              </p>
            `
            : ""
        }

        ${
          row.notes
            ? `
              <p>
                ${
                  esc(
                    row.notes
                  )
                }
              </p>
            `
            : ""
        }
      `
  },

  notes: {
    title:
      "Notes",

    table:
      "daily_notes",

    order:
      "note_date",

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

    display:
      row => `
        <h3>

          ${
            esc(
              row.note_date
            )
          }

          ${
            row.category
              ? `
                <span
                  class="tag"
                >
                  ${
                    esc(
                      row.category
                    )
                  }
                </span>
              `
              : ""
          }

        </h3>

        <p>
          ${
            esc(
              row.note_text
            )
          }
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
  let editingId =
    null;

  page.innerHTML = `
    <div
      class="heading"
    >

      <h2>
        ${spec.title}
      </h2>

      <button
        id="toggle-form"
        class="primary"
        type="button"
      >
        + Add
      </button>

    </div>

    <form
      id="record-form"
      class="form hidden"
    >

      <div
        class="form-grid"
      >

        ${
          spec.fields
            .filter(
              field =>
                field[2] !==
                "textarea"
            )
            .map(
              fieldHtml
            )
            .join("")
        }

      </div>

      ${
        spec.fields
          .filter(
            field =>
              field[2] ===
              "textarea"
          )
          .map(
            fieldHtml
          )
          .join("")
      }

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

      <p
        id="form-message"
      ></p>

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
    editingId =
      null;

    form.reset();

    form.classList.add(
      "hidden"
    );

    saveButton.textContent =
      "Save";

    cancelButton
      .classList
      .add(
        "hidden"
      );

    toggleButton.textContent =
      "+ Add";

    message.textContent =
      "";
  }

  function beginEdit(
    row
  ) {
    editingId =
      row.id;

    for (
      const [
        key
      ]
      of spec.fields
    ) {
      const element =
        document
          .getElementById(
            key
          );

      if (
        !element
      ) {
        continue;
      }

      const value =
        row[key];

      element.value =
        value ==
        null
          ? ""
          : String(
              value
            );
    }

    form
      .classList
      .remove(
        "hidden"
      );

    saveButton.textContent =
      "Save Changes";

    cancelButton
      .classList
      .remove(
        "hidden"
      );

    message.textContent =
      "Editing existing record";

    form.scrollIntoView({
      behavior:
        "smooth",

      block:
        "start"
    });
  }

  toggleButton
    .addEventListener(
      "click",
      () => {
        if (
          editingId
        ) {
          resetForm();
        }

        form
          .classList
          .toggle(
            "hidden"
          );
      }
    );

  cancelButton
    .addEventListener(
      "click",
      resetForm
    );

  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      message.textContent =
        "";

      const payload =
        {};

      for (
        const [
          key,
          ,
          type
        ]
        of spec.fields
      ) {
        const element =
          document
            .getElementById(
              key
            );

        let value =
          element.value
            .trim();

        if (
          value ===
          ""
        ) {
          value =
            null;
        }

        if (
          type ===
            "number" &&
          value !==
            null
        ) {
          value =
            Number(
              value
            );
        }

        payload[key] =
          value;
      }

      const result =
        editingId
          ? await db
              .from(
                spec.table
              )
              .update(
                payload
              )
              .eq(
                "id",
                editingId
              )

          : await db
              .from(
                spec.table
              )
              .insert(
                payload
              );

      if (
        result.error
      ) {
        message.textContent =
          result
            .error
            .message;

        return;
      }

      resetForm();

      await loadRecords(
        spec,
        beginEdit
      );
    }
  );

  await loadRecords(
    spec,
    beginEdit
  );
}

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
  } =
    await db
      .from(
        spec.table
      )
      .select("*")
      .order(
        spec.order,
        {
          ascending:
            false
        }
      );

  if (
    error
  ) {
    box.innerHTML = `
      <div class="empty">
        ${
          esc(
            error.message
          )
        }
      </div>
    `;

    return;
  }

  if (
    !data?.length
  ) {
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
              ${
                spec.display(
                  row
                )
              }
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
                data-id="${
                  row.id
                }"
                type="button"
              >
                Edit
              </button>

              <button
                class="delete delete-record"
                data-id="${
                  row.id
                }"
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
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            const row =
              data.find(
                item =>
                  String(
                    item.id
                  ) ===
                  String(
                    button
                      .dataset
                      .id
                  )
              );

            if (
              row &&
              onEdit
            ) {
              onEdit(
                row
              );
            }
          }
        );
      }
    );

  box
    .querySelectorAll(
      ".delete-record"
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

            const {
              error
            } =
              await db
                .from(
                  spec.table
                )
                .delete()
                .eq(
                  "id",
                  button
                    .dataset
                    .id
                );

            if (
              error
            ) {
              alert(
                error.message
              );

              return;
            }

            await loadRecords(
              spec,
              onEdit
            );
          }
        );
      }
    );
}

/* =====================================================
   HELPERS
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

          ${
            options
              .map(
                ([
                  optionValue,
                  optionText
                ]) => `
                  <option
                    value="${
                      optionValue
                    }"
                  >
                    ${
                      optionText
                    }
                  </option>
                `
              )
              .join("")
          }

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
  renderer
) {
  if (
    !rows?.length
  ) {
    return `
      <div class="empty">
        Nothing to show.
      </div>
    `;
  }

  return `
    <div class="list">

      ${
        rows
          .map(
            row => `
              <article
                class="card"
              >
                ${
                  renderer(
                    row
                  )
                }
              </article>
            `
          )
          .join("")
      }

    </div>
  `;
}

function nullable(
  id
) {
  const element =
    document.querySelector(
      `#${id}`
    );

  if (
    !element
  ) {
    return null;
  }

  const value =
    element.value
      .trim();

  return (
    value ===
    ""
      ? null
      : value
  );
}

function nullableNumber(
  id
) {
  const element =
    document.querySelector(
      `#${id}`
    );

  if (
    !element
  ) {
    return null;
  }

  const value =
    element.value
      .trim();

  if (
    value ===
    ""
  ) {
    return null;
  }

  return Number(
    value
  );
}

function today() {
  return formatDate(
    new Date()
  );
}

function currentTimeValue() {
  const now =
    new Date();

  const hours =
    String(
      now.getHours()
    ).padStart(
      2,
      "0"
    );

  const minutes =
    String(
      now.getMinutes()
    ).padStart(
      2,
      "0"
    );

  return `${hours}:${minutes}`;
}

function timeToMinutes(
  time
) {
  if (
    !time
  ) {
    return 0;
  }

  const parts =
    time
      .slice(
        0,
        5
      )
      .split(
        ":"
      );

  const hours =
    Number(
      parts[0]
    ) ||
    0;

  const minutes =
    Number(
      parts[1]
    ) ||
    0;

  return (
    hours *
      60 +
    minutes
  );
}

function formatTimeForDisplay(
  time
) {
  if (
    !time
  ) {
    return "";
  }

  const [
    hours,
    minutes
  ] =
    time
      .slice(
        0,
        5
      )
      .split(
        ":"
      )
      .map(
        Number
      );

  const date =
    new Date(
      2000,
      0,
      1,
      hours,
      minutes
    );

  return date
    .toLocaleTimeString(
      "en-CA",
      {
        hour:
          "numeric",

        minute:
          "2-digit"
      }
    );
}

function formatDate(
  date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
      1
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

function formatDisplayDate(
  dateString
) {
  if (
    !dateString
  ) {
    return "";
  }

  const [
    year,
    month,
    day
  ] =
    dateString
      .split(
        "-"
      )
      .map(
        Number
      );

  const date =
    new Date(
      year,
      month -
        1,
      day
    );

  return date
    .toLocaleDateString(
      "en-CA",
      {
        month:
          "short",

        day:
          "numeric",

        year:
          "numeric"
      }
    );
}

function formatQuantity(
  number
) {
  const parsed =
    Number(
      number
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return "0";
  }

  return parsed
    .toLocaleString(
      "en-CA",
      {
        maximumFractionDigits:
          3
      }
    );
}

function humanize(
  value
) {
  return String(
    value ||
    ""
  )
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      letter =>
        letter
          .toUpperCase()
    );
}

function esc(
  value
) {
  const div =
    document
      .createElement(
        "div"
      );

  div.textContent =
    value ??
    "";

  return div.innerHTML;
}
