require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const token = process.env.BOT_TOKEN;
const url = process.env.APP_URL;

const bot = new TelegramBot(token);

// Configuration du webhook avec gestion d'erreur
async function setupWebhook() {
  try {
    const webhookInfo = await bot.getWebHookInfo();
    if (webhookInfo.url !== `${url}/bot${token}`) {
      await bot.setWebHook(`${url}/bot${token}`);
      console.log("Webhook configuré avec succès");
    } else {
      console.log("Webhook déjà correctement configuré");
    }
  } catch (error) {
    console.error("Erreur lors de la configuration du webhook:", error);
  }
}

// Appel de la fonction de configuration du webhook
setupWebhook();

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
    bot
      .sendMessage(
        chatId,
        "Code validé ! Vous recevrez maintenant des notifications."
      )
      .catch((error) =>
        console.error("Erreur lors de l'envoi du message:", error)
      );
  } else {
    bot
      .sendMessage(
        chatId,
        "Veuillez entrer le code à 6 chiffres généré par l'application."
      )
      .catch((error) =>
        console.error("Erreur lors de l'envoi du message:", error)
      );
  }
});

app.post("/send-notification", (req, res) => {
  const { code, message } = req.body;

  if (userCodes.has(code)) {
    const chatId = userCodes.get(code);
    bot
      .sendMessage(chatId, message)
      .then(() => res.status(200).send("Notification envoyée avec succès"))
      .catch((error) => {
        console.error("Erreur lors de l'envoi de la notification:", error);
        res.status(500).send("Erreur lors de l'envoi de la notification");
      });
  } else {
    res.status(404).send("Code non trouvé");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});

// Gestion globale des erreurs non gérées
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Application specific logging, throwing an error, or other logic here
});

// Gestion des erreurs pour Express
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});
