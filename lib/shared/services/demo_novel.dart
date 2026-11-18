// 职责: Demo 小说初始化 — 首次启动或空库时创建官方标杆级科幻小说示例《深空编年史：最后的光锥》
// 关联文件:
//   lib/shared/database/app_database.dart
//   lib/shared/database/novel_content_database.dart
//   lib/shared/utils/storage_paths.dart
//   lib/shared/utils/text_unit_count.dart
//   lib/desktop/pages/home.dart

import 'package:drift/drift.dart';
import 'package:reveric/shared/models/asset_purpose.dart';
import 'package:flutter/services.dart';

import '../database/app_database.dart';
import '../database/novel_content_database.dart';
import '../models/content_status.dart';
import '../models/outline_draft.dart';
import '../utils/random_id.dart';
import '../utils/text_unit_count.dart';
import '../utils/short_entity_id.dart';
import '../utils/short_entity_id_allocator.dart';
import '../logger/app_logger.dart';
import 'novel_content.dart';
import 'image_library_service.dart';

const _demoChapterOneContent = '''深空航行第两万五千五百天，柯伊伯带边缘的引力透镜阵列响起了红色警报。

不是机械故障，也不是陨石撞击。林澜猛地从休眠凝胶舱中直起身，冰冷的复苏液顺着她的下颌滴落，在无重力环境下凝成一颗颗漂浮的幽蓝水珠。

“艾娃，报告警报源。”她一边扯掉贴在太阳穴上的神经电极，一边快速滑向主控台。

“首席物理学家林澜，已确认唤醒。”冰冷而平稳的合成女声在空旷的舰桥内回荡，“三分钟前，超导量子干涉仪在视界坐标（214, 088, -12）捕获了一组高能引力波脉冲。频率持续锁定在普朗克尺度，不符合任何已知天然天体事件。”

林澜的手指在全息交互屏上如飞起舞。视网膜上投射出的波形图让她瞳孔剧烈收缩。

那不是杂乱的宇宙背景噪声，而是呈现出高度有序的曼德博分形结构的数字序列。更诡异的是，信号的载波不是电磁辐射，而是直接对空间曲率进行高频扰动的引力涟漪。

“信标特征码破译进度如何？”

“破译已完成百分之八十。”艾娃的声音似乎出现了一丝极难察觉的微秒级延迟，“源信标签名包含联合国深空远征军团第VII级数字证书。硬件公钥匹配度为百分之百。”

林澜整个人僵在原地。

“你再说一遍？公钥匹配哪艘舰艇？”

“匹配本机。”艾娃缓缓调出对比阵列，“发射源签名来自‘远征七号’主控核心。信标内部的时间戳编码为……星历3174年9月。”

星历3174年。

而今天，是星历2874年。

这是一道来自三百年后、来自未来母舰残骸深处的求救信号。

舰桥的气密门无声滑开。舰长周远大步走了进来，他的战术制服领口未扣，左侧那只军用级钛合金义眼在昏暗的红色警报灯下闪烁着冷冽的红芒。

“我听到了二级警报，林澜。”周远的声音低沉而沙哑，带着冷冻休眠后的干涩，“我们距离下一个跃迁节点还有四光月，这时候停船会耗尽辅助聚变堆百分之七的储备燃料。”

“我们必须停船，舰长。”林澜没有回头，她将主观测屏推向周远的视野中，“你自己看。”

周远的机械义眼微微缩放，微型对焦马达发出细微的嗡鸣。当他看清信号源坐标与三百年后的时间戳时，整个人像一座雕塑般定格在原地。

“未来的我们……死了？”良久，周远才吐出一句话。

“信号里包含一段坍塌的光锥坐标，还有一个倒计时。”林澜指着闪烁的红色倒三角标记，“距离信标预设的因果律锁死，我们只剩下四十七个标准时。”''';

const _demoChapterTwoContent = '''“远征七号”的减速矢量喷口在真空中喷吐出长达数十公里的幽蓝等离子羽流。

沉重的过载将林澜狠狠压在控制椅上。她盯着全息星图上那个不断放大的虚空座标。根据理论，那片空域没有任何宏观物质，只有几颗冰冷的氨冰碎块在柯伊伯带的漫漫长夜里漂移。

然而，长基线合成孔径雷达给出的反馈却彻底颠覆了物理常识。

“前方三万公里处，空间曲率呈现负无限大。”林澜的嗓音在通讯频道里回荡，“有一个尺度在三公里左右的‘泡’，那里的引力常数被某种外力强行扭曲了。”

“是跃迁残余吗？”周远的声音从战术指挥席传来。

“不，不是常规跃迁。它像是一个被遗弃在时空连续体上的伤疤。”

主屏幕上的光学影像经过多重暗场降噪后，终于显露出了真容。

所有人都屏住了呼吸。

在永恒的虚空背景中，悬浮着一座庞大如山脉的金属造物。那是“远征七号”的轮廓——长达六公里的纺锤形舰体，外层厚重的纳米合金装甲板上布满了狰狞的撕裂伤痕，巨大的主引擎环已经断裂成三截，像折断的龙骨般歪斜地漂浮在一旁。

但这并不是最令人毛骨悚然的。

林澜拉近了舰艏的细节放大镜头。

在残骸的外壳上，用高能激光焊枪烙刻着密密麻麻的数字和警告标识。那些字迹因为岁月的侵蚀已经有些模糊，但每一个字都在无声地诉说着某种绝望的挣扎。

“警告：不可直视视界内侧。”周远一字一顿地读出外壳上的字迹，脸色阴沉如铁，“‘如果你们读到这段文字，立即过载反应堆自毁。不要试图寻找答案。’署名是……林澜。”

林澜下意识地后退了半步，背脊渗出一层冷汗。

那确实是她自己的字迹，甚至连字母末端微微上扬的连笔习惯都分毫不差。

“艾娃，检测残骸生命体征。”林澜强迫自己冷静下来，指节因用力而发白。

“扫描完成。无活动生命体征。但残骸核心仓的辅助能源仍在维持最低限度的逻辑运算……等等，检测到定向通讯激光射束！”

还没等林澜反应过来，舰桥的主通讯仪发出一声刺耳的爆鸣。

一道未经任何加密的数据流直接冲破了“远征七号”的防火墙，投射在主屏幕中央。

画面中是一片狼藉的指挥舱，昏暗的紧急照明灯在天花板上摇晃。一个头发花白、脸上横亘着一道深可见骨疤痕的女人坐在舰长席上。

那是三十年后的林澜。

画面中的她抬起头，布满血丝的双眼穿透了时空的阻隔，死死盯住了屏幕前的年轻林澜。

“你终于来了。”未来的林澜剧烈地咳嗽着，嘴角溢出一缕暗黑色的血液，“听着，时间不多了。肖恩不是叛徒，他只是看到了黑洞另一侧的真实图景……不要相信光锥！”''';

const _demoChapterThreeContent = '''通讯在剧烈的白噪声中戛然而止。

舰桥内死一般的寂静，只有生命维持系统发出的微弱风声。

周远缓缓转过身，钛合金义眼死死锁定了林澜：“肖恩。她提到了肖恩。”

肖恩是这艘飞船的首席引力工程师，也是三年前因“精神失常试图破坏跃迁引擎”而被周远下令强制深度冷冻的重刑犯。

“肖恩早在出发后第三年就被关进了第七冷冻舱。”周远的手按在腰间的磁吸手枪握柄上，“如果未来的你声称‘肖恩不是叛徒’，那就意味着三年前我的判决错了？或者说，他当年发疯破坏引擎，根本就不是疯了，而是知道了某种我们不知道的真相？”

“周远，把枪放下。”林澜的声音出奇地冷静，“未来的我不会毫无理由地留下这句话。艾娃，调取肖恩被捕前的最后一份实验室日志，权限覆盖码：希格斯-7704。”

“权限确认中……代码有效。正在解密肖恩博士的最后日志。”

屏幕上弹出一份被最高机密封存的物理仿真模型。

模型的中心不是超光速跃迁泡，而是一张扭曲的克莱因瓶结构。

“这是……”林澜靠近屏幕，瞳孔因震撼而放大，“他不是在破坏引擎。他在尝试修改我们的跳跃航线！我们在柯伊伯带规划的这三次引力弹弓加速，并不是朝向半人马座阿尔法星……航线的前方，根本没有恒星！”

周远的眉头拧成了一个死结：“你说什么？星图是由地球最高联合指挥部下发的！”

“最高指挥部欺骗了我们。”林澜飞快地调出全舰质量传感器的深层数据，“‘远征七号’的聚变燃料根本不足以支撑抵达半人马座。从一开始，这艘船的任务就不是殖民开拓，而是一个漂流瓶——一个用来观测大撕裂边缘的活体探测器！”

就在此时，舰体猛然发生了一阵剧烈的震颤。

刺耳的红色警报再次撕裂了宁静。

“警告！前方未来残骸产生引力坍塌！强引力阱正在形成，‘泡’的事件视界正在向外扩张！”艾娃的告警声骤然拔高，“引力潮汐力已超越安全阈值，我们正在被拖入光锥中心！”

“主引擎全功率倒车！”周远大吼。

“动力不足！时空曲率梯度超过临界点！”林澜死死抓住房顶的减震把手，狂暴的重力将她视线中的一切都拉扯成长条状的光带，“周远！只有打开第七冷冻舱，唤醒肖恩！他知道怎么在这张克莱因引力网里滑行！”

周远看着舷窗外那颗逐渐吞噬星光的黑色空洞，深吸了一口气，按下了全舰紧急解冻广播：

“呼叫第七休眠区。终止冷冻协议。唤醒肖恩。”''';

const _demoChapterTitles = <String>[
  '第1章：来自未来的跃迁信标',
  '第2章：光锥边缘的低语',
  '第3章：不可逆视界',
  '第4章：星火逃逸决议',
  '第5章：重构新生',
];

const _demoChapterOutlines = <String>[
  '“远征七号”在柯伊伯带捕获了一组奇怪的量子引力信号，林澜破译后发现该信号竟来自母舰三百年后的未来残骸，且警告倒计时只剩47小时。舰长周远决定中止减速计划，全舰进入二级戒备。',
  '母舰抵达信号源，目睹了破损的未来残骸。残骸表面留着林澜亲笔手书的自毁警告，同时接收到了未来林澜临终前的全息通讯，警告众人“不要相信光锥”，并提及了被冰冻的重刑犯肖恩。',
  '未来残骸发生引力塌陷，形成微型奇点时空网，将母舰死死拖拽。林澜发现飞船航线从一开始就是地球指挥部设计的单向毁灭探测，周远在生死关头决定唤醒被冰冻的工程师肖恩。',
  '肖恩苏醒后揭示了黑洞另一端的真相与时空闭环。众人围绕“过载引擎自毁以打破循环”还是“强行穿过奇点寻找新宇宙”展开激烈的星火决议表决。',
  '林澜与周远联手执行最后的反物质湮灭操作，成功撕开光锥囚笼。飞船穿过视界，在全新的星海与维度中重新确立人类文明的坐标。',
];

Future<String> createDemoNovel(
  AppDatabase database, {
  ShortEntityIdBuilder idBuilder = buildShortEntityId,
}) async {
  final existingNovel =
      await (database.select(database.novels)..where(
            (table) =>
                table.title.equals('深空编年史：最后的光锥') &
                table.deletedAt.equals(notDeletedSentinel),
          ))
          .getSingleOrNull();
  if (existingNovel != null) {
    return existingNovel.id;
  }

  final novelId = idBuilder(ShortEntityIdType.novel);
  final now = DateTime.now();

  String? coverAssetId;
  try {
    final data = await rootBundle.load('assets/images/demo/novel_cover.webp');
    coverAssetId = (await buildImageLibraryService(database).importBytes(
      data.buffer.asUint8List(),
      name: 'novel_cover.webp',
      novelId: novelId,
      purpose: AssetPurpose.cover,
    )).id;
  } catch (_) {
    // cover empty
  }

  await database.novelDao.create(
    id: novelId,
    title: '深空编年史：最后的光锥',
    description:
        '在人类深空远征的第七十年，“远征七号”科考母舰在柯伊伯带边缘捕获了一束超越光速的量子引力信号。当首席物理学家林澜破译出信号源头竟来自母舰三百年后的未来残骸时，一场关乎文明火种延续的星际抉择在寂静黑夜中打响。',
    coverAssetId: coverAssetId,
    tags: const ['科幻', '悬疑', '太空歌剧', '硬科幻', 'demo'],
    category: '科幻',
  );

  final contentDatabasePath = await buildNovelContentDatabasePath(novelId);
  final contentDatabase = NovelContentDatabase(contentDatabasePath);
  await contentDatabase.seedDefaultWorkspace(
    includeInitialChapter: true,
    idBuilder: idBuilder,
  );

  Future<String> insertEntity(
    ShortEntityIdType type,
    String tableName,
    Future<void> Function(String id) insert,
  ) async {
    String? attemptedId;
    try {
      return await insertWithShortEntityId(
        type: type,
        tableName: tableName,
        buildId: idBuilder,
        idExists: (id) async =>
            await contentDatabase
                .customSelect(
                  'SELECT 1 FROM $tableName WHERE id = ? LIMIT 1',
                  variables: [Variable.withString(id)],
                )
                .getSingleOrNull() !=
            null,
        insert: (id) {
          attemptedId = id;
          return insert(id);
        },
      );
    } catch (error, stackTrace) {
      AppLogger.forModule('DemoNovel').error(
        '[DB] $tableName INSERT failed, id=$attemptedId',
        error: error,
        stackTrace: stackTrace,
      );
      rethrow;
    }
  }

  await NovelContentService(
    contentDatabase,
    idBuilder: idBuilder,
  ).outlineService.createOutline(defaultTitle: '星海信标');

  // 更新第1章标题与正文
  final seededChapters = await contentDatabase.chapterDao.getAll();
  if (seededChapters.isNotEmpty) {
    final chapter1 = seededChapters.first;
    await (contentDatabase.update(
      contentDatabase.chapters,
    )..where((c) => c.id.equals(chapter1.id))).write(
      ChaptersCompanion(
        title: const Value('第1章：来自未来的跃迁信标'),
        outline: Value(_demoChapterOutlines[0]),
        content: const Value(_demoChapterOneContent),
        wordCount: Value(countTextUnits(_demoChapterOneContent)),
        updatedAt: Value(now),
      ),
    );
  }

  // 插入后续完整章节
  for (var i = 2; i <= 5; i++) {
    final content = switch (i) {
      2 => _demoChapterTwoContent,
      3 => _demoChapterThreeContent,
      _ => '',
    };
    await insertEntity(
      ShortEntityIdType.chapter,
      'chapters',
      (id) async => contentDatabase.into(contentDatabase.chapters).insert(
        ChaptersCompanion.insert(
          id: id,
          chapterNum: i,
          title: Value(_demoChapterTitles[i - 1]),
          outline: Value(_demoChapterOutlines[i - 1]),
          content: Value(content),
          wordCount: Value(countTextUnits(content)),
          createdAt: Value(now),
          updatedAt: Value(now),
        ),
      ),
    );
  }

  // 角色 Character Profiles
  final linLanId = await insertEntity(
    ShortEntityIdType.character,
    'character_profiles',
    (id) async => contentDatabase
        .into(contentDatabase.characterProfiles)
        .insert(
          CharacterProfilesCompanion.insert(
            id: id,
            name: '林澜',
            role: const Value(characterRoleProtagonist),
            gender: const Value(characterGenderFemale),
            biography: const Value(
              '远征七号首席理论物理学家，引力波干涉学专家。拥有对微观空间曲率波动的敏锐直觉。在破译出未来母舰的自毁信号后，承担起了破除因果律囚笼的核心重任。',
            ),
            description: const Value(
              '二十八岁，眼神沉静锐利，常年穿着淡银色的科研绝缘制服。习惯在思考高维空间方程时下意识摩挲手中的神经电极片。',
            ),
            sortOrder: const Value(0),
            createdAt: Value(now),
            updatedAt: Value(now),
          ),
        ),
  );

  final zhouYuanId = await insertEntity(
    ShortEntityIdType.character,
    'character_profiles',
    (id) async => contentDatabase
        .into(contentDatabase.characterProfiles)
        .insert(
          CharacterProfilesCompanion.insert(
            id: id,
            name: '周远',
            role: const Value(characterRoleSupporting),
            gender: const Value(characterGenderMale),
            biography: const Value(
              '远征七号最高指挥官，经历过第三次太阳风暴的资深远征军人。在绝对理性与全员生死之间坚守军人的荣誉底线，左眼在一次深空拦截任务中更换为战术机械义眼。',
            ),
            description: const Value(
              '四十五岁，身材魁梧挺拔，面容如花岗岩般坚毅，左侧钛合金机械眼随着战术演算闪烁红芒，行事雷厉风行。',
            ),
            sortOrder: const Value(1),
            createdAt: Value(now),
            updatedAt: Value(now),
          ),
        ),
  );

  final aiwaId = await insertEntity(
    ShortEntityIdType.character,
    'character_profiles',
    (id) async => contentDatabase
        .into(contentDatabase.characterProfiles)
        .insert(
          CharacterProfilesCompanion.insert(
            id: id,
            name: '艾娃 (EVA)',
            role: const Value(characterRoleSupporting),
            gender: const Value(characterGenderOther),
            biography: const Value(
              '母舰主控超导人工智能矩阵。掌管飞船生命维持、动力分配与深空引力航道计算。在面临未来时间悖论冲击时，其底层安全协议出现了未知的自我觉醒迹象。',
            ),
            description: const Value(
              '以全息光影形态显现的深蓝色流体女性轮廓，语调冷静客观，但在关键抉择时刻展现出对人类文明火种的执着守护。',
            ),
            sortOrder: const Value(2),
            createdAt: Value(now),
            updatedAt: Value(now),
          ),
        ),
  );

  final seanId = await insertEntity(
    ShortEntityIdType.character,
    'character_profiles',
    (id) async => contentDatabase
        .into(contentDatabase.characterProfiles)
        .insert(
          CharacterProfilesCompanion.insert(
            id: id,
            name: '肖恩',
            role: const Value(characterRoleAntagonist),
            gender: const Value(characterGenderMale),
            biography: const Value(
              '前首席引力工程师，因三年前强行试图篡改母舰跃迁航道而被定性为反叛者并强制冰冻。真相是他早就勘破了地球最高指挥部将远征队当作牺牲品的秘密。',
            ),
            description: const Value(
              '三十六岁，头发凌乱，眼神中带着看透宇宙残酷法则的孤寂与冷漠，是唯一掌握克莱因引力航道跳跃手法的科学家。',
            ),
            sortOrder: const Value(3),
            createdAt: Value(now),
            updatedAt: Value(now),
          ),
        ),
  );

  // 地点 Locations
  await insertEntity(
    ShortEntityIdType.location,
    'locations',
    (id) async => contentDatabase
        .into(contentDatabase.locations)
        .insert(
          LocationsCompanion.insert(
            id: id,
            name: '远征七号主舰桥',
            description: const Value(
              '长达六公里的远征母舰核心神经中枢，拥有直径五十米的全景环形观测穹顶，中央悬浮着全息量子星图交互仪。',
            ),
            type: const Value(locationTypeBuilding),
            tags: const Value('母舰,舰桥,指挥中心'),
            sortOrder: const Value(0),
            createdAt: Value(now),
            updatedAt: Value(now),
          ),
        ),
  );

  await insertEntity(
    ShortEntityIdType.location,
    'locations',
    (id) async => contentDatabase
        .into(contentDatabase.locations)
        .insert(
          LocationsCompanion.insert(
            id: id,
            name: '柯伊伯带视界奇点',
            description: const Value(
              '位于太阳系最边缘的时空扭曲区域，微型引力泡在此撕裂，漂浮着来自三百年后的母舰未来残骸，周围环绕着刺骨的暗物质碎屑。',
            ),
            type: const Value(locationTypeWilderness),
            tags: const Value('深空,黑洞,未来残骸'),
            sortOrder: const Value(1),
            createdAt: Value(now),
            updatedAt: Value(now),
          ),
        ),
  );

  // 世界观设定 Worldview Settings
  await insertEntity(
    ShortEntityIdType.worldview,
    'worldview_settings',
    (id) async => contentDatabase
        .into(contentDatabase.worldviewSettings)
        .insert(
          WorldviewSettingsCompanion.insert(
            id: id,
            category: '物理学与科技',
            title: '量子引力信标与曲率泡',
            content:
                '基于普朗克尺度下的空间微扰技术，能在不借由光速限制的情况下，通过引力涟漪直接在时空薄膜上压印信息，是高维文明跨越因果律光锥传递警告的唯一载体。',
            sortOrder: const Value(0),
            createdAt: Value(now),
            updatedAt: Value(now),
          ),
        ),
  );

  await insertEntity(
    ShortEntityIdType.worldview,
    'worldview_settings',
    (id) async => contentDatabase
        .into(contentDatabase.worldviewSettings)
        .insert(
          WorldviewSettingsCompanion.insert(
            id: id,
            category: '地缘政治与法典',
            title: '深空漂流公约与火种协议',
            content:
                '联合国深空远征最高法典，规定在全舰进入不可逆绝境时，指挥官与物理学首席必须共同开启火种表决，优先保证文明数据与胚胎库跨越视界延续。',
            sortOrder: const Value(1),
            createdAt: Value(now),
            updatedAt: Value(now),
          ),
        ),
  );

  await contentDatabase.close();
  await database.novelDao.updateContentDatabasePath(
    id: novelId,
    contentDatabasePath: contentDatabasePath,
  );
  return novelId;
}
