const TelegramBot = require("node-telegram-bot-api");
const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");
const Position = require("../models/Position");
const { decrypt } = require("../utils/encryption");
const jwt = require("jsonwebtoken");

let bot = null;

const fmtMoney = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₸";
const fmtMin = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}ч ${m}м`;
};

function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("TELEGRAM_BOT_TOKEN not set, bot disabled");
    return;
  }

  bot = new TelegramBot(token, { polling: true });
  console.log("Telegram bot started");

  // /start — авторизация по телефону
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // Проверим, привязан ли уже
    const existing = await Employee.findOne({ telegramChatId: String(chatId) }).populate("position branch");
    if (existing) {
      return bot.sendMessage(chatId,
        `✅ Вы уже авторизованы как *${existing.firstName} ${existing.lastName}*\n\nИспользуйте меню команд ниже:`,
        { parse_mode: "Markdown", reply_markup: getMainKeyboard() }
      );
    }

    bot.sendMessage(chatId,
      "👋 Добро пожаловать в *Келді-Кетті*!\n\nДля авторизации отправьте свой номер телефона:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [[{ text: "📱 Отправить номер телефона", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
  });

  // Получение контакта — авторизация (только через кнопку)
  bot.on("contact", async (msg) => {
    // Принимаем только если контакт принадлежит самому пользователю
    if (msg.contact.user_id && msg.contact.user_id !== msg.from.id) {
      return bot.sendMessage(msg.chat.id,
        "❌ Пожалуйста, отправьте *свой* номер телефона через кнопку.",
        { parse_mode: "Markdown" }
      );
    }
    const chatId = msg.chat.id;
    let phone = msg.contact.phone_number;

    // Нормализуем телефон
    if (!phone.startsWith("+")) phone = "+" + phone;

    const employee = await Employee.findOne({ phone }).populate("position branch organization");
    if (!employee) {
      return bot.sendMessage(chatId,
        "❌ Сотрудник с таким номером не найден.\nОбратитесь к администратору.",
        { reply_markup: { remove_keyboard: true } }
      );
    }

    // Привязываем chatId
    employee.telegramChatId = String(chatId);
    await employee.save();

    bot.sendMessage(chatId,
      `✅ Авторизация успешна!\n\n👤 *${employee.firstName} ${employee.lastName}*\n🏢 ${employee.organization?.name || "—"}\n📍 ${employee.branch?.name || "—"}\n💼 ${employee.position?.name || "—"}\n\nИспользуйте меню ниже:`,
      { parse_mode: "Markdown", reply_markup: getMainKeyboard() }
    );
  });

  // Обработка всех входящих сообщений
  bot.on("message", async (msg) => {
    if (msg.contact) return; // обработано в отдельном хендлере выше

    const chatId = msg.chat.id;

    // WebApp data — результат отметки
    if (msg.web_app_data) {
      try {
        const payload = JSON.parse(msg.web_app_data.data);
        const employee = await Employee.findOne({ telegramChatId: String(chatId) }).populate("position branch");
        if (!employee) return;

        if (payload.success) {
          const typeLabel = payload.type === "check_in" ? "✅ Приход отмечен" : "✅ Уход отмечен";
          const now = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: process.env.TIMEZONE || "Asia/Almaty" });
          bot.sendMessage(chatId,
            `${typeLabel} в *${now}*\n\n👤 ${employee.firstName} ${employee.lastName}\n📍 ${employee.branch?.name || "—"}`,
            { parse_mode: "Markdown", reply_markup: getMainKeyboard() }
          );
        } else if (payload.error) {
          bot.sendMessage(chatId,
            `❌ Ошибка: ${payload.error}`,
            { parse_mode: "Markdown", reply_markup: getMainKeyboard() }
          );
        }
      } catch (e) {
        console.error("[bot] web_app_data parse error:", e);
      }
      return;
    }

    const text = msg.text;
    if (!text) return;

    const employee = await Employee.findOne({ telegramChatId: String(chatId) }).populate("position branch organization");

    if (!employee && text !== "/start") {
      const looksLikePhone = /^[\+\d\s\-\(\)]{7,}$/.test(text.trim());
      if (looksLikePhone) {
        return bot.sendMessage(chatId,
          "📱 Для авторизации нажмите кнопку *«Отправить номер телефона»* ниже.\n\nВводить номер вручную нельзя — это требование безопасности.",
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [[{ text: "📱 Отправить номер телефона", request_contact: true }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      }
      return bot.sendMessage(chatId, "⚠️ Сначала авторизуйтесь: /start");
    }
    if (!employee) return;

    switch (text) {
      case "📊 Мой статус":
        return handleStatus(chatId, employee);
      case "📅 История":
        return handleHistory(chatId, employee);
      case "📈 Статистика":
        return handleStats(chatId, employee);
      case "💰 Зарплата":
        return handleSalary(chatId, employee);
      case "✅ Отметиться":
        return handleCheckWebView(chatId, employee);
      case "ℹ️ Помощь":
        return handleHelp(chatId);
    }
  });

  // Callback query для inline кнопок
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const employee = await Employee.findOne({ telegramChatId: String(chatId) }).populate("position branch");

    if (!employee) {
      return bot.answerCallbackQuery(query.id, { text: "Сначала авторизуйтесь: /start" });
    }

    if (data === "refresh_status") {
      await bot.answerCallbackQuery(query.id, { text: "Обновлено" });
      return handleStatus(chatId, employee);
    }
  });
}

function getMainKeyboard() {
  return {
    keyboard: [
      ["📊 Мой статус", "✅ Отметиться"],
      ["📅 История", "📈 Статистика"],
      ["💰 Зарплата", "ℹ️ Помощь"],
    ],
    resize_keyboard: true,
  };
}

// 📊 Статус
async function handleStatus(chatId, employee) {
  const statusEmoji = employee.status === "working" ? "🟢" : "🔴";
  const statusText = employee.status === "working" ? "На работе" : "Не на работе";

  const today = new Date().toISOString().split("T")[0];
  const todayRecords = await Attendance.find({
    employee: employee._id,
    date: today,
  }).sort({ createdAt: 1 });

  let todayInfo = "Сегодня записей нет";
  if (todayRecords.length > 0) {
    todayInfo = todayRecords.map((r) => {
      const time = new Date(r.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: process.env.TIMEZONE || "Asia/Almaty" });
      return `${r.type === "check_in" ? "➡️" : "⬅️"} ${r.type === "check_in" ? "Пришёл" : "Ушёл"} — ${time}`;
    }).join("\n");
  }

  const schedule = employee.position
    ? `🕐 График: ${employee.position.workStartTime} — ${employee.position.workEndTime}`
    : "";

  bot.sendMessage(chatId,
    `${statusEmoji} *${statusText}*\n\n👤 ${employee.firstName} ${employee.lastName}\n📍 ${employee.branch?.name || "—"}\n💼 ${employee.position?.name || "—"}\n${schedule}\n\n📋 *Сегодня:*\n${todayInfo}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🔄 Обновить", callback_data: "refresh_status" }]],
      },
    }
  );
}

// 📅 История (последние 7 дней)
async function handleHistory(chatId, employee) {
  const endDate = new Date().toISOString().split("T")[0];
  const startD = new Date();
  startD.setDate(startD.getDate() - 7);
  const startDate = startD.toISOString().split("T")[0];

  const records = await Attendance.find({
    employee: employee._id,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ createdAt: -1 });

  if (records.length === 0) {
    return bot.sendMessage(chatId, "📅 За последние 7 дней записей нет.");
  }

  // Group by date
  const byDate = {};
  records.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  let text = "📅 *История за 7 дней:*\n\n";
  Object.entries(byDate).forEach(([date, dayRecords]) => {
    const d = new Date(date + "T00:00:00");
    const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short", timeZone: process.env.TIMEZONE || "Asia/Almaty" });
    text += `📆 *${label}*\n`;
    dayRecords.forEach((r) => {
      const time = new Date(r.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: process.env.TIMEZONE || "Asia/Almaty" });
      text += `  ${r.type === "check_in" ? "➡️ Пришёл" : "⬅️ Ушёл"} — ${time}\n`;
    });
    text += "\n";
  });

  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
}

// 📈 Статистика (текущий месяц)
async function handleStats(chatId, employee) {
  if (!employee.position) {
    return bot.sendMessage(chatId, "⚠️ К вам не привязана должность. Обратитесь к администратору.");
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const records = await Attendance.find({
    employee: employee._id,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ createdAt: 1 });

  const byDate = {};
  records.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  const [sh, sm] = employee.position.workStartTime.split(":").map(Number);
  const [eh, em] = employee.position.workEndTime.split(":").map(Number);

  let totalDays = 0, late = 0, onTime = 0, early = 0, totalWorked = 0;

  Object.values(byDate).forEach((dayRecords) => {
    const ci = dayRecords.find((r) => r.type === "check_in");
    const co = dayRecords.find((r) => r.type === "check_out");
    if (!ci) return;
    totalDays++;

    const ciTime = new Date(ci.createdAt);
    const diff = (ciTime.getHours() * 60 + ciTime.getMinutes()) - (sh * 60 + sm);
    if (diff > 5) late++;
    else if (diff < -5) early++;
    else onTime++;

    if (co) {
      const coTime = new Date(co.createdAt);
      totalWorked += (coTime.getHours() * 60 + coTime.getMinutes()) - (ciTime.getHours() * 60 + ciTime.getMinutes());
    }
  });

  const monthNames = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

  bot.sendMessage(chatId,
    `📈 *Статистика за ${monthNames[month - 1]}*\n\n` +
    `📅 Рабочих дней: *${totalDays}*\n` +
    `✅ Вовремя: *${onTime}*\n` +
    `⚡ Рано: *${early}*\n` +
    `⏰ Опоздал: *${late}*\n` +
    `🕐 Всего отработано: *${fmtMin(totalWorked)}*\n` +
    (totalDays > 0 ? `📊 Среднее: *${fmtMin(Math.round(totalWorked / totalDays))}* в день` : ""),
    { parse_mode: "Markdown" }
  );
}

// 💰 Зарплата
async function handleSalary(chatId, employee) {
  if (!employee.position) {
    return bot.sendMessage(chatId, "⚠️ К вам не привязана должность.");
  }

  const pos = employee.position;
  if (!pos.salary) {
    return bot.sendMessage(chatId, "⚠️ Зарплата для вашей должности не указана.");
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const records = await Attendance.find({
    employee: employee._id,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ createdAt: 1 });

  const byDate = {};
  records.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  const [sh, sm] = pos.workStartTime.split(":").map(Number);
  const [eh, em] = pos.workEndTime.split(":").map(Number);

  let totalLateMin = 0;
  let totalOvertimeMin = 0;

  Object.values(byDate).forEach((dayRecords) => {
    const ci = dayRecords.find((r) => r.type === "check_in");
    const co = dayRecords.find((r) => r.type === "check_out");
    if (!ci) return;

    const ciTime = new Date(ci.createdAt);
    const lateMin = (ciTime.getHours() * 60 + ciTime.getMinutes()) - (sh * 60 + sm);
    if (lateMin > 5) totalLateMin += lateMin;

    if (co) {
      const coTime = new Date(co.createdAt);
      const overtime = (coTime.getHours() * 60 + coTime.getMinutes()) - (eh * 60 + em);
      if (overtime > 5) totalOvertimeMin += overtime;
    }
  });

  const penaltyPerMin = pos.penaltyPerMinutes || 10;
  const penaltyAmt = pos.penaltyAmount || 0;
  const totalPenalty = penaltyAmt > 0 ? Math.floor(totalLateMin / penaltyPerMin) * penaltyAmt : 0;

  let totalPremium = 0;
  if (pos.premiumEnabled && pos.premiumAmount > 0) {
    totalPremium = Math.floor(totalOvertimeMin / (pos.premiumPerMinutes || 10)) * pos.premiumAmount;
  }

  const net = pos.salary - totalPenalty + totalPremium;

  const monthNames = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

  let text = `💰 *Зарплата за ${monthNames[month - 1]}*\n\n`;
  text += `💵 Оклад: *${fmtMoney(pos.salary)}*\n`;
  if (totalPenalty > 0) {
    text += `🔻 Штрафы: *-${fmtMoney(totalPenalty)}*\n`;
    text += `   _(${totalLateMin} мин опозданий × ${fmtMoney(penaltyAmt)}/${penaltyPerMin}мин)_\n`;
  }
  if (totalPremium > 0) {
    text += `🔺 Премия: *+${fmtMoney(totalPremium)}*\n`;
    text += `   _(${totalOvertimeMin} мин переработки)_\n`;
  }
  text += `\n💳 *Итого: ${fmtMoney(net)}*`;

  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
}

// ✅ Отметиться — WebView
function handleCheckWebView(chatId, employee) {
  const webAppUrl = process.env.EMPLOYEE_WEB_URL || "https://keldi-ketti-emp.kepket.uz";

  // Генерируем JWT токен для автологина
  const token = jwt.sign(
    {
      id: employee._id,
      role: "employee",
      organizationId: employee.organization?._id || employee.organization,
      branchId: employee.branch?._id || employee.branch,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  const url = `${webAppUrl}/?token=${encodeURIComponent(token)}`;

  bot.sendMessage(chatId,
    "✅ Нажмите кнопку ниже, чтобы отметить приход/уход:",
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "📍 Отметиться", web_app: { url } },
        ]],
      },
    }
  );
}

// ℹ️ Помощь
function handleHelp(chatId) {
  bot.sendMessage(chatId,
    "ℹ️ *Келді-Кетті — Помощь*\n\n" +
    "📊 *Мой статус* — текущий статус и записи за сегодня\n" +
    "✅ *Отметиться* — открыть страницу для отметки (приход/уход)\n" +
    "📅 *История* — записи за последние 7 дней\n" +
    "📈 *Статистика* — сводка за текущий месяц\n" +
    "💰 *Зарплата* — расчёт зарплаты с учётом штрафов и премий\n\n" +
    "По вопросам обращайтесь к администратору.",
    { parse_mode: "Markdown" }
  );
}

function sendAttendanceNotification(chatId, type, employee) {
  if (!bot) return;
  const typeLabel = type === "check_in" ? "✅ Приход отмечен" : "✅ Уход отмечен";
  const now = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: process.env.TIMEZONE || "Asia/Almaty" });
  bot.sendMessage(
    chatId,
    `${typeLabel} в *${now}*\n\n👤 ${employee.firstName} ${employee.lastName}\n📍 ${employee.branch?.name || "—"}`,
    { parse_mode: "Markdown", reply_markup: getMainKeyboard() }
  ).catch((e) => console.error("[bot] sendAttendanceNotification error:", e.message));
}

module.exports = { startBot, sendAttendanceNotification };
