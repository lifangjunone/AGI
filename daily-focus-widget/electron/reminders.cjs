const SLOT_HOURS = [11, 15, 19];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getReminderCandidates(tasks, reminderLog, now = new Date()) {
  const today = localDateKey(now);
  const active = tasks.filter((task) => task.date === today && !task.completed);
  const candidates = [];

  for (const task of active) {
    if (!task.time) continue;
    const dueAt = new Date(`${task.date}T${task.time}:00`);
    const minutesLate = Math.floor((now.getTime() - dueAt.getTime()) / 60000);
    const reminderKey = `${task.id}:due`;

    if (minutesLate >= 0 && minutesLate <= 10 && !reminderLog[reminderKey]) {
      candidates.push({
        key: reminderKey,
        title: task.title,
        body: minutesLate > 0 ? `已到时间 ${task.time}，现在处理最合适` : `计划时间 ${task.time} 已到`
      });
    }
  }

  for (const hour of SLOT_HOURS) {
    const slotKey = `${today}:slot:${hour}`;
    if (now.getHours() !== hour || now.getMinutes() > 9 || reminderLog[slotKey] || !active.length) {
      continue;
    }

    const urgent = active.filter((task) => task.priority === "high").length;
    candidates.push({
      key: slotKey,
      title: hour < 15 ? "今天，从最重要的一件开始" : "今日待办还在等你",
      body: urgent
        ? `还有 ${active.length} 项，其中 ${urgent} 项已置顶`
        : `还有 ${active.length} 项未完成，打开看看下一件`
    });
  }

  return candidates;
}

module.exports = { getReminderCandidates, localDateKey };
