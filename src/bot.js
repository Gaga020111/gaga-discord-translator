'use strict';

const path = require('node:path');
const {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const {
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} = require('@discordjs/voice');
const prism = require('prism-media');
const dotenv = require('dotenv');

const { clampInt, pcmDurationMs } = require('./pcm');
const { GroqTranslationService } = require('./cloud-translation');

const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) {
  console.error('找不到 DISCORD_TOKEN。請先把 .env.example 複製成 .env，並貼上 Bot Token。');
  process.exit(1);
}

const silenceMs = clampInt(process.env.SILENCE_MS, 900, 300, 5_000);
const minUtteranceMs = clampInt(process.env.MIN_UTTERANCE_MS, 700, 300, 5_000);
const maxUtteranceMs = clampInt(process.env.MAX_UTTERANCE_MS, 15_000, 2_000, 30_000);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
const translator = new GroqTranslationService();
const sessions = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('加入你所在的語音頻道，開始英文→繁中字幕'),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('停止字幕並離開語音頻道'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('查看 Bot 與翻譯模型狀態'),
  new SlashCommandBuilder()
    .setName('bothelp')
    .setDescription('顯示使用方法'),
].map((command) => command.toJSON());

function safeName(member) {
  return member?.displayName || member?.user?.globalName || member?.user?.username || '未知成員';
}

async function sendSubtitle(channel, member, result) {
  const english = String(result.english || '').trim();
  const chinese = String(result.chinese_traditional || '').trim();
  if (!english || !chinese) return;

  const content = [
    `🎤 **${safeName(member)}**`,
    `🇺🇸 ${english}`,
    `🇹🇼 **${chinese}**`,
  ].join('\n');

  await channel.send({
    content: content.slice(0, 2_000),
    allowedMentions: { parse: [] },
  });
}

function listenToSpeaker(session, userId) {
  if (session.activeUsers.has(userId)) return;

  const member = session.guild.members.cache.get(userId);
  if (!member || member.user.bot) return;

  session.activeUsers.add(userId);
  const opusStream = session.connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: silenceMs },
  });
  const decoder = new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 });
  const chunks = [];
  let totalBytes = 0;
  let finished = false;

  const finish = async () => {
    if (finished) return;
    finished = true;
    clearTimeout(maxTimer);
    session.activeUsers.delete(userId);

    const pcm = Buffer.concat(chunks, totalBytes);
    if (pcmDurationMs(pcm) < minUtteranceMs || !translator.ready) return;

    try {
      const result = await translator.translatePcm(pcm);
      await sendSubtitle(session.textChannel, member, result);
    } catch (error) {
      console.error(`處理 ${safeName(member)} 的語音失敗：`, error);
    }
  };

  const maxTimer = setTimeout(() => {
    opusStream.unpipe(decoder);
    decoder.end();
    opusStream.destroy();
  }, maxUtteranceMs);

  opusStream.on('error', (error) => {
    console.error(`接收 ${safeName(member)} 的語音失敗：`, error);
  });
  decoder.on('data', (chunk) => {
    chunks.push(chunk);
    totalBytes += chunk.length;
  });
  decoder.on('error', (error) => {
    console.error(`解碼 ${safeName(member)} 的語音失敗：`, error);
  });
  decoder.once('end', finish);
  decoder.once('close', finish);
  opusStream.pipe(decoder);
}

async function startSession(interaction) {
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: '你要先加入一個語音頻道，再輸入 `/join`。', ephemeral: true });
    return;
  }

  if (!translator.ready) {
    await interaction.reply({
      content: '雲端主機尚未設定 `GROQ_API_KEY`，請在主機的秘密設定中補上後重新啟動。',
      ephemeral: true,
    });
    return;
  }

  const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
    await interaction.reply({ content: '我缺少「查看頻道」或「連線」權限。', ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const oldSession = sessions.get(interaction.guildId);
  if (oldSession) {
    oldSession.connection.destroy();
    sessions.delete(interaction.guildId);
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    connection.destroy();
    console.error('語音連線失敗：', error);
    await interaction.editReply('無法連上語音頻道。請確認 Bot 權限與網路，再試一次。');
    return;
  }

  const session = {
    connection,
    guild: interaction.guild,
    textChannel: interaction.channel,
    activeUsers: new Set(),
  };
  sessions.set(interaction.guildId, session);
  connection.receiver.speaking.on('start', (userId) => listenToSpeaker(session, userId));
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    if (sessions.get(interaction.guildId) === session) sessions.delete(interaction.guildId);
  });

  await interaction.editReply([
    `✅ 已加入 **${voiceChannel.name}**，英文語音會翻成繁中並貼在 ${interaction.channel}。`,
    '🔒 本 Bot 不會寫入錄音檔；語音片段會送至 Groq API 辨識及翻譯。',
    '⚠️ 請先讓頻道成員知道 Bot 正在處理語音。',
  ].join('\n'));
}

async function stopSession(interaction) {
  const session = sessions.get(interaction.guildId);
  const connection = session?.connection || getVoiceConnection(interaction.guildId);
  if (!connection) {
    await interaction.reply({ content: '我目前不在語音頻道。', ephemeral: true });
    return;
  }
  connection.destroy();
  sessions.delete(interaction.guildId);
  await interaction.reply('👋 已停止字幕並離開語音頻道。');
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Discord Bot 已登入：${readyClient.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(token);
  const testGuildId = (process.env.TEST_GUILD_ID || '').trim();
  try {
    if (testGuildId) {
      await rest.put(Routes.applicationGuildCommands(readyClient.user.id, testGuildId), { body: commands });
      console.log(`已在測試伺服器 ${testGuildId} 註冊斜線指令。`);
    } else {
      await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands });
      console.log('已註冊全域斜線指令。');
    }
  } catch (error) {
    console.error('註冊斜線指令失敗：', error);
  }

  const invite = `https://discord.com/oauth2/authorize?client_id=${readyClient.user.id}&scope=bot%20applications.commands&permissions=36703232`;
  console.log(`邀請 Bot：${invite}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

  try {
    if (interaction.commandName === 'join') await startSession(interaction);
    if (interaction.commandName === 'leave') await stopSession(interaction);
    if (interaction.commandName === 'status') {
      const connected = Boolean(sessions.get(interaction.guildId));
      await interaction.reply({
        content: [
          `Discord：${client.isReady() ? '✅ 已連線' : '⏳ 連線中'}`,
          `Groq API：${translator.ready ? '✅ 已設定' : '❌ 尚未設定 API Key'}`,
          `目前語音字幕：${connected ? '✅ 執行中' : '⏹️ 未啟動'}`,
        ].join('\n'),
        ephemeral: true,
      });
    }
    if (interaction.commandName === 'bothelp') {
      await interaction.reply({
        content: [
          '`/join`：加入你所在的語音頻道並開始字幕',
          '`/leave`：停止字幕並離開',
          '`/status`：檢查 Discord 與 Groq API 設定',
          '字幕會送到你執行 `/join` 的文字頻道。',
          '處理方式：英文語音片段會送至 Groq API，再把英文與繁中字幕貼回 Discord。',
        ].join('\n'),
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('處理 Discord 指令失敗：', error);
    const message = { content: '操作失敗，請到 Oracle 主機查看 Bot 記錄。', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(message).catch(() => {});
    else await interaction.reply(message).catch(() => {});
  }
});

async function shutdown() {
  for (const session of sessions.values()) session.connection.destroy();
  sessions.clear();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(token);
