
const $ = id => document.getElementById(id);

const STORAGE_KEY = "spendwise-data";

let settings = null;
let transactions = [];

function today() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
}

function money(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(amount);
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        settings,
        transactions
    }));
}

function loadData() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (data) {
            settings = data.settings || null;
            transactions = Array.isArray(data.transactions)
                ? data.transactions : [];
        }
    } catch (error) {
        settings = null;
        transactions = [];
    }
}

function endDate() {
    const date = new Date(settings.startDate + "T00:00:00");
    date.setMonth(date.getMonth() + settings.duration);
    date.setDate(date.getDate() - 1);
    return date;
}

function daysRemaining() {
    const end = endDate();
    const start = new Date(today() + "T00:00:00");

    if (start > end) return 0;

    return Math.floor(
        (end - start) / (1000 * 60 * 60 * 24)
    ) + 1;
}

function getMetrics() {
    const periodTransactions = settings
        ? transactions.filter(t =>
            t.date >= settings.startDate &&
            t.date <= endDate().toLocaleDateString("en-CA")
        )
        : transactions;

    const extraIncome = periodTransactions
        .filter(t => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);

    const spent = periodTransactions
        .filter(t => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0);

    if (!settings) {
        return {
            income: extraIncome,
            spent,
            balance: extraIncome - spent,
            reserved: 0,
            daily: 0,
            days: 0,
            pool: 0,
            remaining: 0,
            percent: 0
        };
    }

    const baseIncome = settings.mode === "monthly"
        ? settings.amount * settings.duration
        : settings.amount;

    const income = baseIncome + extraIncome;
    const reserved = settings.fixedCosts + settings.savings;
    const pool = Math.max(0, income - reserved);
    const remaining = Math.max(0, pool - spent);
    const days = daysRemaining();
    const daily = days > 0 ? remaining / days : 0;
    const percent = pool > 0
        ? Math.min(100, spent / pool * 100)
        : spent > 0 ? 100 : 0;

    return {
        income, spent, balance: income - spent,
        reserved, daily, days, pool, remaining, percent
    };
}

function updateMode() {
    $("money-label").textContent =
        $("income-mode").value === "monthly"
            ? "Monthly Income (₹)"
            : "Total Available Amount (₹)";
}

$("income-mode").addEventListener("change", updateMode);

$("setup-form").addEventListener("submit", function(event) {
    event.preventDefault();

    const amount = Number($("starting-money").value);
    const fixedCosts = Number($("fixed-costs").value);
    const savings = Number($("savings").value);
    const duration = Number($("duration").value);
    const startDate = $("start-date").value;

    if (!Number.isFinite(amount) || amount <= 0) {
        alert("Enter an income or amount greater than zero.");
        return;
    }

    if (fixedCosts + savings >
        amount * ($("income-mode").value === "monthly" ? duration : 1)) {
        if (!confirm("Your reserves exceed the expected income. Save anyway?")) {
            return;
        }
    }

    settings = {
        name: $("person-name").value.trim(),
        mode: $("income-mode").value,
        amount,
        startDate,
        duration,
        fixedCosts,
        savings
    };

    saveData();
    render();
    alert("Budget saved successfully.");
});

$("transaction-form").addEventListener("submit", function(event) {
    event.preventDefault();

    const amount = Number($("amount").value);
    const description = $("description").value.trim();

    if (!description || !Number.isFinite(amount) || amount <= 0) {
        alert("Enter a valid description and amount.");
        return;
    }

    transactions.push({
        id: Date.now().toString() + Math.random().toString(16).slice(2),
        type: $("type").value,
        description,
        amount,
        category: $("category").value,
        date: $("transaction-date").value
    });

    saveData();
    this.reset();
    $("transaction-date").value = today();
    render();
});

function getAdvice(m) {
    if (!settings) {
        return "Enter your income and budget duration to get a daily spending recommendation.";
    }

    if (m.days === 0) {
        return "Your budget period has ended. Review your transactions and set up a new budget.";
    }

    if (m.pool <= 0) {
        return "Your fixed expenses and savings target use all your expected income. Review your budget before spending.";
    }

    if (m.balance < 0) {
        return "Your expenses exceed your expected income. Review your spending and upcoming bills.";
    }

    if (m.remaining === 0) {
        return "Your spendable budget has been used. Avoid non-essential spending and review your remaining commitments.";
    }

    const periodDays = Math.floor(
        (endDate() - new Date(settings.startDate + "T00:00:00"))
        / (1000 * 60 * 60 * 24)
    ) + 1;

    const elapsedDays = Math.max(0, periodDays - m.days);
    const expectedSpending = m.pool * elapsedDays / periodDays;
    const difference = m.spent - expectedSpending;

    if (difference > m.pool * 0.08 && elapsedDays > 0) {
        return "Your spending is ahead of the planned pace. Consider reducing optional expenses and check upcoming bills.";
    }

    return "Try to stay near " + money(m.daily) +
        " per day. This estimate assumes your income and reserved amounts are accurate.";
}

function renderTransactions() {
    const list = $("transaction-list");
    list.replaceChildren();

    if (transactions.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.textContent = "No transactions yet.";
        row.appendChild(cell);
        list.appendChild(row);
        return;
    }

    [...transactions].sort((a, b) => b.date.localeCompare(a.date))
        .forEach(t => {
            const row = document.createElement("tr");

            [
                t.description,
                t.category,
                t.date,
                t.type === "income" ? "Income" : "Expense",
                (t.type === "income" ? "+" : "−") + money(t.amount)
            ].forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            const actionCell = document.createElement("td");
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Delete";
            button.addEventListener("click", () => {
                transactions = transactions.filter(x => x.id !== t.id);
                saveData();
                render();
            });
            actionCell.appendChild(button);
            row.appendChild(actionCell);
            list.appendChild(row);
        });
}

function render() {
    const m = getMetrics();

    $("balance").textContent = money(m.balance);
    $("income").textContent = money(m.income);
    $("spent").textContent = money(m.spent);
    $("daily-budget").textContent = money(m.daily);
    $("days-left").textContent = settings
        ? m.days + " days remaining"
        : "Set up your budget first.";

    $("progress").style.width = m.percent + "%";
    $("progress").classList.toggle("over", m.percent >= 90);

    $("status").textContent = !settings
        ? "Set up your budget to see your status."
        : m.percent >= 100
            ? "Your planned spending limit has been reached."
            : m.percent >= 75
                ? "You have used a large part of your budget."
                : "Keep recording expenses to track your budget.";

    $("advice").textContent = getAdvice(m);
    renderTransactions();
}

$("export-button").addEventListener("click", function() {
    const rows = [
        ["Description", "Category", "Date", "Type", "Amount"],
        ...transactions.map(t => [
            t.description, t.category, t.date, t.type, t.amount
        ])
    ];

    const csv = rows.map(row =>
        row.map(value =>
            '"' + String(value).replace(/"/g, '""') + '"'
        ).join(",")
    ).join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "spendwise-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
});

$("clear-button").addEventListener("click", function() {
    if (confirm("Delete all budget settings and transactions?")) {
        settings = null;
        transactions = [];
        saveData();
        $("setup-form").reset();
        $("transaction-form").reset();
        $("start-date").value = today();
        $("transaction-date").value = today();
        $("duration").value = "3";
        $("fixed-costs").value = "0";
        $("savings").value = "0";
        updateMode();
        render();
    }
});

$("start-date").value = today();
$("transaction-date").value = today();

loadData();

if (settings) {
    $("person-name").value = settings.name;
    $("income-mode").value = settings.mode;
    $("starting-money").value = settings.amount;
    $("start-date").value = settings.startDate;
    $("duration").value = String(settings.duration);
    $("fixed-costs").value = settings.fixedCosts;
    $("savings").value = settings.savings;
}

updateMode();
render();
