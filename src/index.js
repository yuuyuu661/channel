import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  ChannelType,
  PermissionFlagsBits
} from 'discord.js';
import { loadStore, setTransfer, getTransfer } from './transferStore.js';

const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.APPLICATION_ID;
const GUILD_ID = process.env.GUILD_ID;
const GUILD_IDS = (process.env.GUILD_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// 要求: このコマンドを使えるユーザー/ロール
const ALLOWED_USER_ID = '716667546241335328';
const ALLOWED_ROLE_ID = '1419701562460344362';

// 起動時設定チェック
if (!APP_ID || !/^\d{17,}$/.test(APP_ID)) {
  console.error('[config] APPLICATION_ID is missing or invalid. Set your Application (Client) ID.');
}
if (APP_ID === ALLOWED_USER_ID) {
  console.warn('[config] APPLICATION_ID equals ALLOWED_USER_ID. This is likely wrong. Use the bot\'s Application (Client) ID, not a user ID.');
}

// 自動生成VCの作成中フラグ（重複生成防止）
const creatingMap = new Map(); // key: transferChannelId -> boolean
// 起動中に生成したVCの追跡（空になったら自動削除）
const generatedSet = new Set(); // channelId

// ===== Slash Command 定義 =====
const commands = [
  {
    name: 'create-transfer',
    description: '転送用ボイスチャンネルを作成します（入室で自動的に新規VCへ転送）',
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
    dm_permission: false,
    options: [
      {
        name: 'name',
        description: '転送用ボイスチャンネルの名前',
        type: 3, // STRING
        required: true
      },
      {
        name: 'limit',
        description: '自動生成されるVCの最大参加人数（0は無制限）',
        type: 4, // INTEGER
        required: true,
        min_value: 0,
        max_value: 99
      }
    ]
  },
  {
    name: 'sync-commands',
    description: 'このサーバーのスラッシュコマンドを即時同期（再登録）します',
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    dm_permission: false
  }
];

async function putGuildCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(APP_ID, guildId), { body: commands });
  console.log(`[slash] registered for guild ${guildId}`);
}

async function registerCommands() {
  const targets = GUILD_IDS.length ? GUILD_IDS : (GUILD_ID ? [GUILD_ID] : []);
  for (const gid of targets) {
    try {
      await putGuildCommands(gid);
    } catch (e) {
      console.error(`[slash] failed for guild ${gid}`, e);
    }
  }
  if (!targets.length) {
    console.log('[slash] no GUILD_ID(S) set; skipped registration.');
  }
}

if (process.argv.includes('--register')) {
  // 単体実行: 設定済みのギルドへ登録のみ
  registerCommands().catch(console.error).finally(() => process.exit(0));
}

// ===== Bot 本体 =====
loadStore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.GuildMember]
});

client.once('clientReady', async () => {
  console.log(`[ready] Logged in as ${client.user.tag}`);
  try {
    await registerCommands(); // 起動時に設定済みギルドへ登録
  } catch (e) {
    console.error('[slash] failed to register at ready:', e);
  }
});

// 権限チェック
function isAllowed(interaction) {
  if (interaction.user.id === ALLOWED_USER_ID) return true;
  const member = interaction.member;
  if (!member) return false;
  return member.roles?.cache?.has(ALLOWED_ROLE_ID) || false;
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'sync-commands') {
    if (!isAllowed(interaction)) {
      return interaction.reply({ content: '権限がありません。', ephemeral: true });
    }
    try {
      await putGuildCommands(interaction.guildId);
      return interaction.reply({ content: `このサーバー(${interaction.guildId})のコマンドを同期しました。`, ephemeral: true });
    } catch (e) {
      console.error('[slash] sync error', e);
      return interaction.reply({ content: '同期中にエラーが発生しました。BotのアプリID/権限/環境変数を確認してください。', ephemeral: true });
    }
  }

  if (interaction.commandName === 'create-transfer') {
    const name = interaction.options.getString('name', true);
    const limit = interaction.options.getInteger('limit', true);

    if (!isAllowed(interaction)) {
      return interaction.reply({
        content: 'このコマンドを実行できるのは指定ユーザー/ロールのみです。',
        ephemeral: true
      });
    }

    try {
      // 同名のボイスチャンネルが既にあるか軽くチェック
      const exists = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name === name);
      if (exists) {
        return interaction.reply({ content: `同名のボイスチャンネルが既に存在します: <#${exists.id}>`, ephemeral: true });
      }

      // 作成先のカテゴリ: 実行チャンネルと同じカテゴリ（なければギルド直下）
      const parentId = interaction.channel?.parentId ?? null;

      const transfer = await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        userLimit: 0,
        parent: parentId,
        reason: 'Transfer VC (lobby)'
      });

      // 設定を保存
      setTransfer(transfer.id, { baseName: name, userLimit: limit });

      await interaction.reply({
        content: `転送用VCを作成しました → <#${transfer.id}>\n参加者がここに入室すると、自動で新しいVC(参加上限: **${limit}**)が作られ、全員が移動されます。`
      });
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: 'チャンネル作成中にエラーが発生しました。Botに「チャンネル管理」「メンバーを移動」権限があるか確認してください。', ephemeral: true });
    }
  }
});

// 新規VC名の採番
function nextAutoName(guild, baseName) {
  const pattern = new RegExp(`^${escapeRegex(baseName)}-\d{3}$`);
  const nums = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildVoice && pattern.test(c.name))
    .map(c => parseInt(c.name.slice(-3), 10))
    .filter(n => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${baseName}-${String(next).padStart(3, '0')}`;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// VC入退室イベント
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    // 転送VCに入ってきた？
    const joinedId = newState.channelId;
    if (joinedId && getTransfer(joinedId)) {
      const transferId = joinedId;
      if (creatingMap.get(transferId)) return; // 同時多発防止
      creatingMap.set(transferId, true);

      const guild = newState.guild;
      const conf = getTransfer(transferId);
      const parent = newState.channel?.parent ?? null;

      // 現在の転送VCメンバーを取得（動的に変化するのでスナップショット）
      const transferChannel = newState.channel;
      const members = [...transferChannel.members.values()];
      if (members.length === 0) {
        creatingMap.delete(transferId);
        return;
      }

      // 新しいVCを作成
      const name = nextAutoName(guild, conf.baseName);
      const newVc = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        userLimit: conf.userLimit ?? 0,
        parent: parent?.id ?? null,
        reason: 'Auto-generated by transfer VC bot'
      });

      generatedSet.add(newVc.id);

      // 全員移動
      await Promise.allSettled(members.map(m => m.voice.setChannel(newVc).catch(() => null)));

      creatingMap.delete(transferId);
    }

    // 生成VCが空になったら削除
    const leftChannel = oldState.channel; // 離れた先
    if (leftChannel && generatedSet.has(leftChannel.id)) {
      // 少し待って確実に空か確認（移動レース対策）
      setTimeout(async () => {
        try {
          const fresh = await leftChannel.fetch();
          if (fresh.members.size === 0) {
            await fresh.delete('Auto-delete empty generated VC');
            generatedSet.delete(leftChannel.id);
          }
        } catch (_) {}
      }, 1500);
    }
  } catch (e) {
    console.error('[voiceStateUpdate error]', e);
  }
});

client.login(TOKEN);
