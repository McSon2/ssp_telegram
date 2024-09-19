require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const token = process.env.BOT_TOKEN;
const url = process.env.APP_URL;

const bot = new TelegramBot(token);

// Configuration du webhook
bot.setWebHook(`${url}/bot${token}`);

// Gestion des mises à jour via webhook
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Map pour stocker les associations code -> chatId
const userCodes = new Map();

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (messageText && messageText.length === 6) {
    userCodes.set(messageText, chatId);
    bot.sendMessage(
      chatId,
      "Code validé ! Vous recevrez maintenant des notifications."
    );
  } else {
    bot.sendMessage(
      chatId,
      "Veuillez entrer le code à 6 chiffres généré par l'application."
    );
  }
});

app.post("/send-notification", (req, res) => {
  const { code, message } = req.body;

  if (userCodes.has(code)) {
    const chatId = userCodes.get(code);
    bot.sendMessage(chatId, message);
    res.status(200).send("Notification envoyée avec succès");
  } else {
    res.status(404).send("Code non trouvé");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});
