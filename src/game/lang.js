// Language of the menus (title and pause, with the save slots), the stage results and the in-game score line: English,
// or Simplified Chinese (for showing the game off on bilibili). Picked with the page
// address's ?lang=cn (or ?lang=zh); without it the game is in English (there is no language button in the menu). Nothing else is translated.
import { params } from './nav.js';

const lang = ['cn', 'zh'].includes((params.get('lang') ?? '').toLowerCase()) ? 'zh' : 'en';

export const isZh = () => lang === 'zh';
// tr(english): the text in the language in use (the English itself if there's no translation)
export const tr = en => (lang === 'zh' && ZH[en]) || en;
export const secretName = () => lang === 'zh' ? '隐藏关' : 'SECRET STAGE';
export const stageName = n => lang === 'zh' ? `第 ${n} 关` : `STAGE ${n}`;
export const stageClear = n => lang === 'zh' ? `第 ${n} 关 完成` : `STAGE ${n} CLEAR`;
// Put the language in use into every [data-tr] element under `root` (its English is kept in the attribute).
export function translate(root) { for (const el of root.querySelectorAll('[data-tr]')) el.textContent = tr(el.dataset.tr); }

const ZH = {
  // title screen
  'JACKAL': '赤色要塞', 'REMASTER': '重制版',
  'MAIN MENU': '主菜单', 'NEW GAME': '新游戏', 'LOAD GAME': '读取存档', 'SELECT STAGE': '选择关卡', 'CONTROLS': '操作说明',
  'SETTINGS': '设置', 'VOLUME': '音量', 'SFX': '音效', 'MUSIC': '音乐', 'GRAPHICS': '画质', 'FULL SCREEN': '全屏', 'EXIT FULL SCREEN': '退出全屏', 'BACK': '返回', 'LANGUAGE': '语言',
  'ULTRA': '极高', 'HIGH': '高', 'MEDIUM': '中', 'LOW': '低',
  'MOVE': '移动', 'MOVE UP': '向上移动', 'MOVE DOWN': '向下移动', 'MOVE LEFT': '向左移动', 'MOVE RIGHT': '向右移动',
  'RESET TO DEFAULT': '恢复默认', 'CLICK A KEY TO CHANGE IT. ESC CANCELS, BACKSPACE CLEARS.': '点击按键进行修改。Esc 取消，Backspace 清除。',
  'WALKER': '步行机甲', 'ALPHA': '阿尔法', 'BETA': '贝塔', 'TANK': '坦克', 'STATUE': '雕像', 'GUN': '机枪', 'MACHINE GUN': '机枪', 'GRENADE / ROCKET': '手雷 / 火箭弹', 'PAUSE, SAVE, LOAD': '暂停、存档、读档',
  'FLY CAMERA': '自由视角', 'PERFORMANCE': '性能显示', 'WASD / ARROWS': 'WASD / 方向键',
  // the pause menu and the save slots
  'PAUSED': '暂停', 'RESUME': '继续游戏', 'SAVE GAME': '保存游戏', 'QUIT TO TITLE': '返回标题', 'SAVE GAME (NOT IN BOSS FIGHT)': '保存游戏（首领战中不可用）',
  'SLOT': '存档位', 'EMPTY': '空', 'NAME FOR SLOT': '存档名称 · 存档位', 'REPLACES THE SAVE THERE': '将覆盖原有存档', 'SAVE': '保存', 'CANCEL': '取消',
  'SAVED TO SLOT': '已保存到存档位', 'COULD NOT SAVE (STORAGE BLOCKED?)': '无法保存（浏览器存储被禁用？）', 'ADJUSTING GRAPHICS': '正在调整画质',
  // the stage results
  'ALL STAGES': '全部关卡', 'SECRET': '隐藏关', 'THIS STAGE': '本关', 'STAGE': '关卡', 'POWS': '战俘', 'SECRETS': '隐藏道具', 'SCORE': '得分', 'TOTAL': '合计', 'SECRET STAGE CLEAR': '隐藏关 完成', 'KILL RATE': '击毁率', 'POWS RESCUED': '救出战俘', 'TIME': '用时', 'SECRETS FOUND': '发现隐藏道具', 'SUPER SECRET': '超级隐藏', 'STAGE BONUS': '过关奖励',
  'TOTAL SCORE': '总得分', 'TOTAL TIME': '总用时', 'RESTART MISSION': '重新开始任务', 'RETRY FROM STAGE START': '从本关开头重试', 'NEXT STAGE ▶': '下一关 ▶', 'APPLY': '应用',
  'The most detail, at the highest cost: smoothed edges, the finest soft shadows, and full-resolution water with smoothed reflections. Only slightly better than HIGH. For a fast graphics card.': '细节最高、开销最大：平滑边缘、最精细的柔和阴影、全分辨率水面与平滑倒影。仅比“高”略好。适合高性能显卡。',
  'Recommended. Smoothed edges, soft shadows and water with reflections at reduced resolution. Nearly as good as ULTRA for about half the shadow cost.': '推荐。平滑边缘、柔和阴影，以及降低分辨率的水面倒影。效果接近“极高”，阴影开销约为其一半。',
  'For laptops and integrated graphics: no smoothed edges, simpler shadows, lower-resolution water, no sky lighting (a flatter, darker look) and no shadows from wreckage.': '适合笔记本和集成显卡：无边缘平滑、阴影简化、水面分辨率降低、无天空光照（画面更平更暗）、残骸不投射阴影。',
  'The lowest cost, for slow computers: basic shadows, plain-colour water with no reflections or see-through view, no glow from shots and blasts, no sky lighting, no shadows from small plants, and half the loose wreckage.': '最低开销，适合低配电脑：基础阴影、纯色水面（无倒影、无透视）、射击与爆炸无光晕、无天空光照、小型植物无阴影、碎片数量减半。',
  'MORE STAGES COMING': '更多关卡敬请期待',
  // the loading screen
  'LOADING': '加载中', 'READY': '就绪', 'CLICK OR PRESS ANY KEY TO START': '点击或按任意键开始', 'FAILED TO LOAD (SEE CONSOLE)': '加载失败（请查看控制台）',
  'LOADING CODE': '加载代码', 'PAINTING TERRAIN': '绘制地形', 'PLANTING SCENERY': '种植植被', 'POURING CONCRETE': '浇筑混凝土',
  'BUILDING WALLS AND BRIDGES': '修建围墙与桥梁', 'PLACING OBJECTS': '摆放物件', 'OPTIMISING': '优化中', 'DEPLOYING TROOPS': '部署敌军',
  'PREPARING THE JEEP': '准备吉普车', 'SETTING THE WEATHER': '设置天气', 'PLACING PICKUPS': '放置道具', 'LAUNCHING SUBMARINES': '潜艇下水', 'ARMING DEFENCES': '装备防御', 'WAKING THE BOSSES': '唤醒首领',
  'COMPILING SHADERS': '编译着色器', 'FIRST FRAMES': '渲染首批画面',
  // the score line in play
  'GUN FWD': '前炮', 'GUN AFT': '后炮', 'VLS': '垂发',
  'FINAL BOSS': '最终首领', 'POWER STATION': '发电站', 'BOSS': '首领', 'INCOMING': '来袭', 'CANNON': '炮台',
  'JEEP': '吉普', 'POW': '战俘', 'GRENADE': '手雷', 'ROCKET': '火箭弹', 'ROCKET II': '火箭弹 II', 'ROCKET III': '火箭弹 III',
};
