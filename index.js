require("dotenv").config();
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import { json } from "body-parser";

const app = express();
app.use(json());

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

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
