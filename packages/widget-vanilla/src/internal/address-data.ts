/**
 * Static address schema dataset for the global address widget.
 *
 * No external API calls. All data inlined for offline-first operation.
 * Sources: ISO-3166-1 alpha-2; KR/JP/CN/US administrative divisions per
 * Wikipedia (verified 2026-04). HK 18 districts per HK Gov.
 *
 * Bundle-size discipline:
 * - admin1 entries are flat objects, no closures.
 * - children arrays only for KR (시/도 → 시/군/구) which is the primary market.
 * - Other countries with admin1 (JP/CN/US) skip children to save bytes.
 */

export type AddressFieldKey = "admin1" | "admin2" | "city" | "line1" | "line2" | "postal";

export type AdminEntry = {
  readonly code: string;
  readonly nameLocal: string;
  readonly nameEn: string;
  readonly children?: readonly AdminEntry[];
};

export type CountrySchema = {
  readonly code: string;
  readonly nameEn: string;
  readonly nameKo: string;
  readonly aliases: readonly string[];
  readonly fields: readonly AddressFieldKey[];
  readonly fieldLabels?: Partial<Record<AddressFieldKey, { ko: string; en: string }>>;
  readonly required: readonly AddressFieldKey[];
  readonly postalRegex?: string;
  readonly postalPlaceholder?: string;
  readonly admin1?: readonly AdminEntry[];
  readonly postalAutoFill?: Readonly<Record<string, string>>;
};

// ── KR admin1 (17 시/도) with admin2 children ───────────────────────────────
// 광역/특별시 → 구 목록. 도 → 시/군 목록. 정확도 우선.

const KR_SEOUL_GU: readonly AdminEntry[] = [
  { code: "11010", nameLocal: "종로구", nameEn: "Jongno-gu" },
  { code: "11020", nameLocal: "중구", nameEn: "Jung-gu" },
  { code: "11030", nameLocal: "용산구", nameEn: "Yongsan-gu" },
  { code: "11040", nameLocal: "성동구", nameEn: "Seongdong-gu" },
  { code: "11050", nameLocal: "광진구", nameEn: "Gwangjin-gu" },
  { code: "11060", nameLocal: "동대문구", nameEn: "Dongdaemun-gu" },
  { code: "11070", nameLocal: "중랑구", nameEn: "Jungnang-gu" },
  { code: "11080", nameLocal: "성북구", nameEn: "Seongbuk-gu" },
  { code: "11090", nameLocal: "강북구", nameEn: "Gangbuk-gu" },
  { code: "11100", nameLocal: "도봉구", nameEn: "Dobong-gu" },
  { code: "11110", nameLocal: "노원구", nameEn: "Nowon-gu" },
  { code: "11120", nameLocal: "은평구", nameEn: "Eunpyeong-gu" },
  { code: "11130", nameLocal: "서대문구", nameEn: "Seodaemun-gu" },
  { code: "11140", nameLocal: "마포구", nameEn: "Mapo-gu" },
  { code: "11150", nameLocal: "양천구", nameEn: "Yangcheon-gu" },
  { code: "11160", nameLocal: "강서구", nameEn: "Gangseo-gu" },
  { code: "11170", nameLocal: "구로구", nameEn: "Guro-gu" },
  { code: "11180", nameLocal: "금천구", nameEn: "Geumcheon-gu" },
  { code: "11190", nameLocal: "영등포구", nameEn: "Yeongdeungpo-gu" },
  { code: "11200", nameLocal: "동작구", nameEn: "Dongjak-gu" },
  { code: "11210", nameLocal: "관악구", nameEn: "Gwanak-gu" },
  { code: "11220", nameLocal: "서초구", nameEn: "Seocho-gu" },
  { code: "11230", nameLocal: "강남구", nameEn: "Gangnam-gu" },
  { code: "11240", nameLocal: "송파구", nameEn: "Songpa-gu" },
  { code: "11250", nameLocal: "강동구", nameEn: "Gangdong-gu" },
];

const KR_BUSAN_GU: readonly AdminEntry[] = [
  { code: "21010", nameLocal: "중구", nameEn: "Jung-gu" },
  { code: "21020", nameLocal: "서구", nameEn: "Seo-gu" },
  { code: "21030", nameLocal: "동구", nameEn: "Dong-gu" },
  { code: "21040", nameLocal: "영도구", nameEn: "Yeongdo-gu" },
  { code: "21050", nameLocal: "부산진구", nameEn: "Busanjin-gu" },
  { code: "21060", nameLocal: "동래구", nameEn: "Dongnae-gu" },
  { code: "21070", nameLocal: "남구", nameEn: "Nam-gu" },
  { code: "21080", nameLocal: "북구", nameEn: "Buk-gu" },
  { code: "21090", nameLocal: "해운대구", nameEn: "Haeundae-gu" },
  { code: "21100", nameLocal: "사하구", nameEn: "Saha-gu" },
  { code: "21110", nameLocal: "금정구", nameEn: "Geumjeong-gu" },
  { code: "21120", nameLocal: "강서구", nameEn: "Gangseo-gu" },
  { code: "21130", nameLocal: "연제구", nameEn: "Yeonje-gu" },
  { code: "21140", nameLocal: "수영구", nameEn: "Suyeong-gu" },
  { code: "21150", nameLocal: "사상구", nameEn: "Sasang-gu" },
  { code: "21160", nameLocal: "기장군", nameEn: "Gijang-gun" },
];

const KR_DAEGU: readonly AdminEntry[] = [
  { code: "22010", nameLocal: "중구", nameEn: "Jung-gu" },
  { code: "22020", nameLocal: "동구", nameEn: "Dong-gu" },
  { code: "22030", nameLocal: "서구", nameEn: "Seo-gu" },
  { code: "22040", nameLocal: "남구", nameEn: "Nam-gu" },
  { code: "22050", nameLocal: "북구", nameEn: "Buk-gu" },
  { code: "22060", nameLocal: "수성구", nameEn: "Suseong-gu" },
  { code: "22070", nameLocal: "달서구", nameEn: "Dalseo-gu" },
  { code: "22080", nameLocal: "달성군", nameEn: "Dalseong-gun" },
  { code: "22090", nameLocal: "군위군", nameEn: "Gunwi-gun" },
];

const KR_INCHEON: readonly AdminEntry[] = [
  { code: "23010", nameLocal: "중구", nameEn: "Jung-gu" },
  { code: "23020", nameLocal: "동구", nameEn: "Dong-gu" },
  { code: "23030", nameLocal: "미추홀구", nameEn: "Michuhol-gu" },
  { code: "23040", nameLocal: "연수구", nameEn: "Yeonsu-gu" },
  { code: "23050", nameLocal: "남동구", nameEn: "Namdong-gu" },
  { code: "23060", nameLocal: "부평구", nameEn: "Bupyeong-gu" },
  { code: "23070", nameLocal: "계양구", nameEn: "Gyeyang-gu" },
  { code: "23080", nameLocal: "서구", nameEn: "Seo-gu" },
  { code: "23090", nameLocal: "강화군", nameEn: "Ganghwa-gun" },
  { code: "23100", nameLocal: "옹진군", nameEn: "Ongjin-gun" },
];

const KR_GWANGJU: readonly AdminEntry[] = [
  { code: "24010", nameLocal: "동구", nameEn: "Dong-gu" },
  { code: "24020", nameLocal: "서구", nameEn: "Seo-gu" },
  { code: "24030", nameLocal: "남구", nameEn: "Nam-gu" },
  { code: "24040", nameLocal: "북구", nameEn: "Buk-gu" },
  { code: "24050", nameLocal: "광산구", nameEn: "Gwangsan-gu" },
];

const KR_DAEJEON: readonly AdminEntry[] = [
  { code: "25010", nameLocal: "동구", nameEn: "Dong-gu" },
  { code: "25020", nameLocal: "중구", nameEn: "Jung-gu" },
  { code: "25030", nameLocal: "서구", nameEn: "Seo-gu" },
  { code: "25040", nameLocal: "유성구", nameEn: "Yuseong-gu" },
  { code: "25050", nameLocal: "대덕구", nameEn: "Daedeok-gu" },
];

const KR_ULSAN: readonly AdminEntry[] = [
  { code: "26010", nameLocal: "중구", nameEn: "Jung-gu" },
  { code: "26020", nameLocal: "남구", nameEn: "Nam-gu" },
  { code: "26030", nameLocal: "동구", nameEn: "Dong-gu" },
  { code: "26040", nameLocal: "북구", nameEn: "Buk-gu" },
  { code: "26050", nameLocal: "울주군", nameEn: "Ulju-gun" },
];

const KR_GYEONGGI: readonly AdminEntry[] = [
  { code: "31010", nameLocal: "수원시", nameEn: "Suwon-si" },
  { code: "31020", nameLocal: "성남시", nameEn: "Seongnam-si" },
  { code: "31030", nameLocal: "고양시", nameEn: "Goyang-si" },
  { code: "31040", nameLocal: "용인시", nameEn: "Yongin-si" },
  { code: "31050", nameLocal: "부천시", nameEn: "Bucheon-si" },
  { code: "31060", nameLocal: "안산시", nameEn: "Ansan-si" },
  { code: "31070", nameLocal: "안양시", nameEn: "Anyang-si" },
  { code: "31080", nameLocal: "남양주시", nameEn: "Namyangju-si" },
  { code: "31090", nameLocal: "화성시", nameEn: "Hwaseong-si" },
  { code: "31100", nameLocal: "평택시", nameEn: "Pyeongtaek-si" },
  { code: "31110", nameLocal: "의정부시", nameEn: "Uijeongbu-si" },
  { code: "31120", nameLocal: "시흥시", nameEn: "Siheung-si" },
  { code: "31130", nameLocal: "파주시", nameEn: "Paju-si" },
  { code: "31140", nameLocal: "김포시", nameEn: "Gimpo-si" },
  { code: "31150", nameLocal: "광명시", nameEn: "Gwangmyeong-si" },
  { code: "31160", nameLocal: "광주시", nameEn: "Gwangju-si" },
  { code: "31170", nameLocal: "군포시", nameEn: "Gunpo-si" },
  { code: "31180", nameLocal: "하남시", nameEn: "Hanam-si" },
  { code: "31190", nameLocal: "오산시", nameEn: "Osan-si" },
  { code: "31200", nameLocal: "이천시", nameEn: "Icheon-si" },
  { code: "31210", nameLocal: "안성시", nameEn: "Anseong-si" },
  { code: "31220", nameLocal: "의왕시", nameEn: "Uiwang-si" },
  { code: "31230", nameLocal: "양주시", nameEn: "Yangju-si" },
  { code: "31240", nameLocal: "구리시", nameEn: "Guri-si" },
  { code: "31250", nameLocal: "포천시", nameEn: "Pocheon-si" },
  { code: "31260", nameLocal: "동두천시", nameEn: "Dongducheon-si" },
  { code: "31270", nameLocal: "여주시", nameEn: "Yeoju-si" },
  { code: "31280", nameLocal: "과천시", nameEn: "Gwacheon-si" },
  { code: "31290", nameLocal: "양평군", nameEn: "Yangpyeong-gun" },
  { code: "31300", nameLocal: "가평군", nameEn: "Gapyeong-gun" },
  { code: "31310", nameLocal: "연천군", nameEn: "Yeoncheon-gun" },
];

const KR_GANGWON: readonly AdminEntry[] = [
  { code: "32010", nameLocal: "춘천시", nameEn: "Chuncheon-si" },
  { code: "32020", nameLocal: "원주시", nameEn: "Wonju-si" },
  { code: "32030", nameLocal: "강릉시", nameEn: "Gangneung-si" },
  { code: "32040", nameLocal: "동해시", nameEn: "Donghae-si" },
  { code: "32050", nameLocal: "태백시", nameEn: "Taebaek-si" },
  { code: "32060", nameLocal: "속초시", nameEn: "Sokcho-si" },
  { code: "32070", nameLocal: "삼척시", nameEn: "Samcheok-si" },
  { code: "32080", nameLocal: "홍천군", nameEn: "Hongcheon-gun" },
  { code: "32090", nameLocal: "횡성군", nameEn: "Hoengseong-gun" },
  { code: "32100", nameLocal: "영월군", nameEn: "Yeongwol-gun" },
  { code: "32110", nameLocal: "평창군", nameEn: "Pyeongchang-gun" },
  { code: "32120", nameLocal: "정선군", nameEn: "Jeongseon-gun" },
  { code: "32130", nameLocal: "철원군", nameEn: "Cheorwon-gun" },
  { code: "32140", nameLocal: "화천군", nameEn: "Hwacheon-gun" },
  { code: "32150", nameLocal: "양구군", nameEn: "Yanggu-gun" },
  { code: "32160", nameLocal: "인제군", nameEn: "Inje-gun" },
  { code: "32170", nameLocal: "고성군", nameEn: "Goseong-gun" },
  { code: "32180", nameLocal: "양양군", nameEn: "Yangyang-gun" },
];

const KR_CHUNGBUK: readonly AdminEntry[] = [
  { code: "33010", nameLocal: "청주시", nameEn: "Cheongju-si" },
  { code: "33020", nameLocal: "충주시", nameEn: "Chungju-si" },
  { code: "33030", nameLocal: "제천시", nameEn: "Jecheon-si" },
  { code: "33040", nameLocal: "보은군", nameEn: "Boeun-gun" },
  { code: "33050", nameLocal: "옥천군", nameEn: "Okcheon-gun" },
  { code: "33060", nameLocal: "영동군", nameEn: "Yeongdong-gun" },
  { code: "33070", nameLocal: "증평군", nameEn: "Jeungpyeong-gun" },
  { code: "33080", nameLocal: "진천군", nameEn: "Jincheon-gun" },
  { code: "33090", nameLocal: "괴산군", nameEn: "Goesan-gun" },
  { code: "33100", nameLocal: "음성군", nameEn: "Eumseong-gun" },
  { code: "33110", nameLocal: "단양군", nameEn: "Danyang-gun" },
];

const KR_CHUNGNAM: readonly AdminEntry[] = [
  { code: "34010", nameLocal: "천안시", nameEn: "Cheonan-si" },
  { code: "34020", nameLocal: "공주시", nameEn: "Gongju-si" },
  { code: "34030", nameLocal: "보령시", nameEn: "Boryeong-si" },
  { code: "34040", nameLocal: "아산시", nameEn: "Asan-si" },
  { code: "34050", nameLocal: "서산시", nameEn: "Seosan-si" },
  { code: "34060", nameLocal: "논산시", nameEn: "Nonsan-si" },
  { code: "34070", nameLocal: "계룡시", nameEn: "Gyeryong-si" },
  { code: "34080", nameLocal: "당진시", nameEn: "Dangjin-si" },
  { code: "34090", nameLocal: "금산군", nameEn: "Geumsan-gun" },
  { code: "34100", nameLocal: "부여군", nameEn: "Buyeo-gun" },
  { code: "34110", nameLocal: "서천군", nameEn: "Seocheon-gun" },
  { code: "34120", nameLocal: "청양군", nameEn: "Cheongyang-gun" },
  { code: "34130", nameLocal: "홍성군", nameEn: "Hongseong-gun" },
  { code: "34140", nameLocal: "예산군", nameEn: "Yesan-gun" },
  { code: "34150", nameLocal: "태안군", nameEn: "Taean-gun" },
];

const KR_JEONBUK: readonly AdminEntry[] = [
  { code: "35010", nameLocal: "전주시", nameEn: "Jeonju-si" },
  { code: "35020", nameLocal: "군산시", nameEn: "Gunsan-si" },
  { code: "35030", nameLocal: "익산시", nameEn: "Iksan-si" },
  { code: "35040", nameLocal: "정읍시", nameEn: "Jeongeup-si" },
  { code: "35050", nameLocal: "남원시", nameEn: "Namwon-si" },
  { code: "35060", nameLocal: "김제시", nameEn: "Gimje-si" },
  { code: "35070", nameLocal: "완주군", nameEn: "Wanju-gun" },
  { code: "35080", nameLocal: "진안군", nameEn: "Jinan-gun" },
  { code: "35090", nameLocal: "무주군", nameEn: "Muju-gun" },
  { code: "35100", nameLocal: "장수군", nameEn: "Jangsu-gun" },
  { code: "35110", nameLocal: "임실군", nameEn: "Imsil-gun" },
  { code: "35120", nameLocal: "순창군", nameEn: "Sunchang-gun" },
  { code: "35130", nameLocal: "고창군", nameEn: "Gochang-gun" },
  { code: "35140", nameLocal: "부안군", nameEn: "Buan-gun" },
];

const KR_JEONNAM: readonly AdminEntry[] = [
  { code: "36010", nameLocal: "목포시", nameEn: "Mokpo-si" },
  { code: "36020", nameLocal: "여수시", nameEn: "Yeosu-si" },
  { code: "36030", nameLocal: "순천시", nameEn: "Suncheon-si" },
  { code: "36040", nameLocal: "나주시", nameEn: "Naju-si" },
  { code: "36050", nameLocal: "광양시", nameEn: "Gwangyang-si" },
  { code: "36060", nameLocal: "담양군", nameEn: "Damyang-gun" },
  { code: "36070", nameLocal: "곡성군", nameEn: "Gokseong-gun" },
  { code: "36080", nameLocal: "구례군", nameEn: "Gurye-gun" },
  { code: "36090", nameLocal: "고흥군", nameEn: "Goheung-gun" },
  { code: "36100", nameLocal: "보성군", nameEn: "Boseong-gun" },
  { code: "36110", nameLocal: "화순군", nameEn: "Hwasun-gun" },
  { code: "36120", nameLocal: "장흥군", nameEn: "Jangheung-gun" },
  { code: "36130", nameLocal: "강진군", nameEn: "Gangjin-gun" },
  { code: "36140", nameLocal: "해남군", nameEn: "Haenam-gun" },
  { code: "36150", nameLocal: "영암군", nameEn: "Yeongam-gun" },
  { code: "36160", nameLocal: "무안군", nameEn: "Muan-gun" },
  { code: "36170", nameLocal: "함평군", nameEn: "Hampyeong-gun" },
  { code: "36180", nameLocal: "영광군", nameEn: "Yeonggwang-gun" },
  { code: "36190", nameLocal: "장성군", nameEn: "Jangseong-gun" },
  { code: "36200", nameLocal: "완도군", nameEn: "Wando-gun" },
  { code: "36210", nameLocal: "진도군", nameEn: "Jindo-gun" },
  { code: "36220", nameLocal: "신안군", nameEn: "Sinan-gun" },
];

const KR_GYEONGBUK: readonly AdminEntry[] = [
  { code: "37010", nameLocal: "포항시", nameEn: "Pohang-si" },
  { code: "37020", nameLocal: "경주시", nameEn: "Gyeongju-si" },
  { code: "37030", nameLocal: "김천시", nameEn: "Gimcheon-si" },
  { code: "37040", nameLocal: "안동시", nameEn: "Andong-si" },
  { code: "37050", nameLocal: "구미시", nameEn: "Gumi-si" },
  { code: "37060", nameLocal: "영주시", nameEn: "Yeongju-si" },
  { code: "37070", nameLocal: "영천시", nameEn: "Yeongcheon-si" },
  { code: "37080", nameLocal: "상주시", nameEn: "Sangju-si" },
  { code: "37090", nameLocal: "문경시", nameEn: "Mungyeong-si" },
  { code: "37100", nameLocal: "경산시", nameEn: "Gyeongsan-si" },
  { code: "37110", nameLocal: "의성군", nameEn: "Uiseong-gun" },
  { code: "37120", nameLocal: "청송군", nameEn: "Cheongsong-gun" },
  { code: "37130", nameLocal: "영양군", nameEn: "Yeongyang-gun" },
  { code: "37140", nameLocal: "영덕군", nameEn: "Yeongdeok-gun" },
  { code: "37150", nameLocal: "청도군", nameEn: "Cheongdo-gun" },
  { code: "37160", nameLocal: "고령군", nameEn: "Goryeong-gun" },
  { code: "37170", nameLocal: "성주군", nameEn: "Seongju-gun" },
  { code: "37180", nameLocal: "칠곡군", nameEn: "Chilgok-gun" },
  { code: "37190", nameLocal: "예천군", nameEn: "Yecheon-gun" },
  { code: "37200", nameLocal: "봉화군", nameEn: "Bonghwa-gun" },
  { code: "37210", nameLocal: "울진군", nameEn: "Uljin-gun" },
  { code: "37220", nameLocal: "울릉군", nameEn: "Ulleung-gun" },
];

const KR_GYEONGNAM: readonly AdminEntry[] = [
  { code: "38010", nameLocal: "창원시", nameEn: "Changwon-si" },
  { code: "38020", nameLocal: "진주시", nameEn: "Jinju-si" },
  { code: "38030", nameLocal: "통영시", nameEn: "Tongyeong-si" },
  { code: "38040", nameLocal: "사천시", nameEn: "Sacheon-si" },
  { code: "38050", nameLocal: "김해시", nameEn: "Gimhae-si" },
  { code: "38060", nameLocal: "밀양시", nameEn: "Miryang-si" },
  { code: "38070", nameLocal: "거제시", nameEn: "Geoje-si" },
  { code: "38080", nameLocal: "양산시", nameEn: "Yangsan-si" },
  { code: "38090", nameLocal: "의령군", nameEn: "Uiryeong-gun" },
  { code: "38100", nameLocal: "함안군", nameEn: "Haman-gun" },
  { code: "38110", nameLocal: "창녕군", nameEn: "Changnyeong-gun" },
  { code: "38120", nameLocal: "고성군", nameEn: "Goseong-gun" },
  { code: "38130", nameLocal: "남해군", nameEn: "Namhae-gun" },
  { code: "38140", nameLocal: "하동군", nameEn: "Hadong-gun" },
  { code: "38150", nameLocal: "산청군", nameEn: "Sancheong-gun" },
  { code: "38160", nameLocal: "함양군", nameEn: "Hamyang-gun" },
  { code: "38170", nameLocal: "거창군", nameEn: "Geochang-gun" },
  { code: "38180", nameLocal: "합천군", nameEn: "Hapcheon-gun" },
];

const KR_JEJU: readonly AdminEntry[] = [
  { code: "39010", nameLocal: "제주시", nameEn: "Jeju-si" },
  { code: "39020", nameLocal: "서귀포시", nameEn: "Seogwipo-si" },
];

const KR_ADMIN1: readonly AdminEntry[] = [
  { code: "KR-11", nameLocal: "서울특별시", nameEn: "Seoul", children: KR_SEOUL_GU },
  { code: "KR-26", nameLocal: "부산광역시", nameEn: "Busan", children: KR_BUSAN_GU },
  { code: "KR-27", nameLocal: "대구광역시", nameEn: "Daegu", children: KR_DAEGU },
  { code: "KR-28", nameLocal: "인천광역시", nameEn: "Incheon", children: KR_INCHEON },
  { code: "KR-29", nameLocal: "광주광역시", nameEn: "Gwangju", children: KR_GWANGJU },
  { code: "KR-30", nameLocal: "대전광역시", nameEn: "Daejeon", children: KR_DAEJEON },
  { code: "KR-31", nameLocal: "울산광역시", nameEn: "Ulsan", children: KR_ULSAN },
  { code: "KR-50", nameLocal: "세종특별자치시", nameEn: "Sejong" },
  { code: "KR-41", nameLocal: "경기도", nameEn: "Gyeonggi", children: KR_GYEONGGI },
  { code: "KR-42", nameLocal: "강원특별자치도", nameEn: "Gangwon", children: KR_GANGWON },
  { code: "KR-43", nameLocal: "충청북도", nameEn: "Chungbuk", children: KR_CHUNGBUK },
  { code: "KR-44", nameLocal: "충청남도", nameEn: "Chungnam", children: KR_CHUNGNAM },
  { code: "KR-45", nameLocal: "전북특별자치도", nameEn: "Jeonbuk", children: KR_JEONBUK },
  { code: "KR-46", nameLocal: "전라남도", nameEn: "Jeonnam", children: KR_JEONNAM },
  { code: "KR-47", nameLocal: "경상북도", nameEn: "Gyeongbuk", children: KR_GYEONGBUK },
  { code: "KR-48", nameLocal: "경상남도", nameEn: "Gyeongnam", children: KR_GYEONGNAM },
  { code: "KR-49", nameLocal: "제주특별자치도", nameEn: "Jeju", children: KR_JEJU },
];

// ── JP admin1 (47 都道府県) ─────────────────────────────────────────────────

const JP_ADMIN1: readonly AdminEntry[] = [
  { code: "JP-01", nameLocal: "北海道", nameEn: "Hokkaido" },
  { code: "JP-02", nameLocal: "青森県", nameEn: "Aomori" },
  { code: "JP-03", nameLocal: "岩手県", nameEn: "Iwate" },
  { code: "JP-04", nameLocal: "宮城県", nameEn: "Miyagi" },
  { code: "JP-05", nameLocal: "秋田県", nameEn: "Akita" },
  { code: "JP-06", nameLocal: "山形県", nameEn: "Yamagata" },
  { code: "JP-07", nameLocal: "福島県", nameEn: "Fukushima" },
  { code: "JP-08", nameLocal: "茨城県", nameEn: "Ibaraki" },
  { code: "JP-09", nameLocal: "栃木県", nameEn: "Tochigi" },
  { code: "JP-10", nameLocal: "群馬県", nameEn: "Gunma" },
  { code: "JP-11", nameLocal: "埼玉県", nameEn: "Saitama" },
  { code: "JP-12", nameLocal: "千葉県", nameEn: "Chiba" },
  { code: "JP-13", nameLocal: "東京都", nameEn: "Tokyo" },
  { code: "JP-14", nameLocal: "神奈川県", nameEn: "Kanagawa" },
  { code: "JP-15", nameLocal: "新潟県", nameEn: "Niigata" },
  { code: "JP-16", nameLocal: "富山県", nameEn: "Toyama" },
  { code: "JP-17", nameLocal: "石川県", nameEn: "Ishikawa" },
  { code: "JP-18", nameLocal: "福井県", nameEn: "Fukui" },
  { code: "JP-19", nameLocal: "山梨県", nameEn: "Yamanashi" },
  { code: "JP-20", nameLocal: "長野県", nameEn: "Nagano" },
  { code: "JP-21", nameLocal: "岐阜県", nameEn: "Gifu" },
  { code: "JP-22", nameLocal: "静岡県", nameEn: "Shizuoka" },
  { code: "JP-23", nameLocal: "愛知県", nameEn: "Aichi" },
  { code: "JP-24", nameLocal: "三重県", nameEn: "Mie" },
  { code: "JP-25", nameLocal: "滋賀県", nameEn: "Shiga" },
  { code: "JP-26", nameLocal: "京都府", nameEn: "Kyoto" },
  { code: "JP-27", nameLocal: "大阪府", nameEn: "Osaka" },
  { code: "JP-28", nameLocal: "兵庫県", nameEn: "Hyogo" },
  { code: "JP-29", nameLocal: "奈良県", nameEn: "Nara" },
  { code: "JP-30", nameLocal: "和歌山県", nameEn: "Wakayama" },
  { code: "JP-31", nameLocal: "鳥取県", nameEn: "Tottori" },
  { code: "JP-32", nameLocal: "島根県", nameEn: "Shimane" },
  { code: "JP-33", nameLocal: "岡山県", nameEn: "Okayama" },
  { code: "JP-34", nameLocal: "広島県", nameEn: "Hiroshima" },
  { code: "JP-35", nameLocal: "山口県", nameEn: "Yamaguchi" },
  { code: "JP-36", nameLocal: "徳島県", nameEn: "Tokushima" },
  { code: "JP-37", nameLocal: "香川県", nameEn: "Kagawa" },
  { code: "JP-38", nameLocal: "愛媛県", nameEn: "Ehime" },
  { code: "JP-39", nameLocal: "高知県", nameEn: "Kochi" },
  { code: "JP-40", nameLocal: "福岡県", nameEn: "Fukuoka" },
  { code: "JP-41", nameLocal: "佐賀県", nameEn: "Saga" },
  { code: "JP-42", nameLocal: "長崎県", nameEn: "Nagasaki" },
  { code: "JP-43", nameLocal: "熊本県", nameEn: "Kumamoto" },
  { code: "JP-44", nameLocal: "大分県", nameEn: "Oita" },
  { code: "JP-45", nameLocal: "宮崎県", nameEn: "Miyazaki" },
  { code: "JP-46", nameLocal: "鹿児島県", nameEn: "Kagoshima" },
  { code: "JP-47", nameLocal: "沖縄県", nameEn: "Okinawa" },
];

// ── CN admin1 (31: 22 省 + 5 自治区 + 4 直轄市) ─────────────────────────────

const CN_ADMIN1: readonly AdminEntry[] = [
  { code: "CN-11", nameLocal: "北京市", nameEn: "Beijing" },
  { code: "CN-12", nameLocal: "天津市", nameEn: "Tianjin" },
  { code: "CN-13", nameLocal: "河北省", nameEn: "Hebei" },
  { code: "CN-14", nameLocal: "山西省", nameEn: "Shanxi" },
  { code: "CN-15", nameLocal: "内蒙古自治区", nameEn: "Inner Mongolia" },
  { code: "CN-21", nameLocal: "辽宁省", nameEn: "Liaoning" },
  { code: "CN-22", nameLocal: "吉林省", nameEn: "Jilin" },
  { code: "CN-23", nameLocal: "黑龙江省", nameEn: "Heilongjiang" },
  { code: "CN-31", nameLocal: "上海市", nameEn: "Shanghai" },
  { code: "CN-32", nameLocal: "江苏省", nameEn: "Jiangsu" },
  { code: "CN-33", nameLocal: "浙江省", nameEn: "Zhejiang" },
  { code: "CN-34", nameLocal: "安徽省", nameEn: "Anhui" },
  { code: "CN-35", nameLocal: "福建省", nameEn: "Fujian" },
  { code: "CN-36", nameLocal: "江西省", nameEn: "Jiangxi" },
  { code: "CN-37", nameLocal: "山东省", nameEn: "Shandong" },
  { code: "CN-41", nameLocal: "河南省", nameEn: "Henan" },
  { code: "CN-42", nameLocal: "湖北省", nameEn: "Hubei" },
  { code: "CN-43", nameLocal: "湖南省", nameEn: "Hunan" },
  { code: "CN-44", nameLocal: "广东省", nameEn: "Guangdong" },
  { code: "CN-45", nameLocal: "广西壮族自治区", nameEn: "Guangxi" },
  { code: "CN-46", nameLocal: "海南省", nameEn: "Hainan" },
  { code: "CN-50", nameLocal: "重庆市", nameEn: "Chongqing" },
  { code: "CN-51", nameLocal: "四川省", nameEn: "Sichuan" },
  { code: "CN-52", nameLocal: "贵州省", nameEn: "Guizhou" },
  { code: "CN-53", nameLocal: "云南省", nameEn: "Yunnan" },
  { code: "CN-54", nameLocal: "西藏自治区", nameEn: "Tibet" },
  { code: "CN-61", nameLocal: "陕西省", nameEn: "Shaanxi" },
  { code: "CN-62", nameLocal: "甘肃省", nameEn: "Gansu" },
  { code: "CN-63", nameLocal: "青海省", nameEn: "Qinghai" },
  { code: "CN-64", nameLocal: "宁夏回族自治区", nameEn: "Ningxia" },
  { code: "CN-65", nameLocal: "新疆维吾尔自治区", nameEn: "Xinjiang" },
];

// CN postal prefix by GB/T 2260-style code (admin1 → first 2 digits + 0000).
const CN_POSTAL_AUTOFILL: Readonly<Record<string, string>> = {
  "CN-11": "100000",
  "CN-12": "300000",
  "CN-13": "050000",
  "CN-14": "030000",
  "CN-15": "010000",
  "CN-21": "110000",
  "CN-22": "130000",
  "CN-23": "150000",
  "CN-31": "200000",
  "CN-32": "210000",
  "CN-33": "310000",
  "CN-34": "230000",
  "CN-35": "350000",
  "CN-36": "330000",
  "CN-37": "250000",
  "CN-41": "450000",
  "CN-42": "430000",
  "CN-43": "410000",
  "CN-44": "510000",
  "CN-45": "530000",
  "CN-46": "570000",
  "CN-50": "400000",
  "CN-51": "610000",
  "CN-52": "550000",
  "CN-53": "650000",
  "CN-54": "850000",
  "CN-61": "710000",
  "CN-62": "730000",
  "CN-63": "810000",
  "CN-64": "750000",
  "CN-65": "830000",
};

// ── HK admin2 (18 districts) — used as primary admin in HK ──────────────────

const HK_DISTRICTS: readonly AdminEntry[] = [
  { code: "HK-CW", nameLocal: "中西區", nameEn: "Central and Western" },
  { code: "HK-WC", nameLocal: "灣仔區", nameEn: "Wan Chai" },
  { code: "HK-EA", nameLocal: "東區", nameEn: "Eastern" },
  { code: "HK-SO", nameLocal: "南區", nameEn: "Southern" },
  { code: "HK-YT", nameLocal: "油尖旺區", nameEn: "Yau Tsim Mong" },
  { code: "HK-SS", nameLocal: "深水埗區", nameEn: "Sham Shui Po" },
  { code: "HK-KC", nameLocal: "九龍城區", nameEn: "Kowloon City" },
  { code: "HK-WT", nameLocal: "黃大仙區", nameEn: "Wong Tai Sin" },
  { code: "HK-KU", nameLocal: "觀塘區", nameEn: "Kwun Tong" },
  { code: "HK-KI", nameLocal: "葵青區", nameEn: "Kwai Tsing" },
  { code: "HK-TW", nameLocal: "荃灣區", nameEn: "Tsuen Wan" },
  { code: "HK-TM", nameLocal: "屯門區", nameEn: "Tuen Mun" },
  { code: "HK-YL", nameLocal: "元朗區", nameEn: "Yuen Long" },
  { code: "HK-NO", nameLocal: "北區", nameEn: "North" },
  { code: "HK-TP", nameLocal: "大埔區", nameEn: "Tai Po" },
  { code: "HK-ST", nameLocal: "沙田區", nameEn: "Sha Tin" },
  { code: "HK-SK", nameLocal: "西貢區", nameEn: "Sai Kung" },
  { code: "HK-IS", nameLocal: "離島區", nameEn: "Islands" },
];

// ── TW admin1 (counties/cities, simplified) ────────────────────────────────

const TW_ADMIN1: readonly AdminEntry[] = [
  { code: "TW-TPE", nameLocal: "臺北市", nameEn: "Taipei" },
  { code: "TW-NWT", nameLocal: "新北市", nameEn: "New Taipei" },
  { code: "TW-TAO", nameLocal: "桃園市", nameEn: "Taoyuan" },
  { code: "TW-TXG", nameLocal: "臺中市", nameEn: "Taichung" },
  { code: "TW-TNN", nameLocal: "臺南市", nameEn: "Tainan" },
  { code: "TW-KHH", nameLocal: "高雄市", nameEn: "Kaohsiung" },
  { code: "TW-KEE", nameLocal: "基隆市", nameEn: "Keelung" },
  { code: "TW-HSZ", nameLocal: "新竹市", nameEn: "Hsinchu City" },
  { code: "TW-HSQ", nameLocal: "新竹縣", nameEn: "Hsinchu County" },
  { code: "TW-MIA", nameLocal: "苗栗縣", nameEn: "Miaoli" },
  { code: "TW-CHA", nameLocal: "彰化縣", nameEn: "Changhua" },
  { code: "TW-NAN", nameLocal: "南投縣", nameEn: "Nantou" },
  { code: "TW-YUN", nameLocal: "雲林縣", nameEn: "Yunlin" },
  { code: "TW-CYI", nameLocal: "嘉義市", nameEn: "Chiayi City" },
  { code: "TW-CYQ", nameLocal: "嘉義縣", nameEn: "Chiayi County" },
  { code: "TW-PIF", nameLocal: "屏東縣", nameEn: "Pingtung" },
  { code: "TW-ILA", nameLocal: "宜蘭縣", nameEn: "Yilan" },
  { code: "TW-HUA", nameLocal: "花蓮縣", nameEn: "Hualien" },
  { code: "TW-TTT", nameLocal: "臺東縣", nameEn: "Taitung" },
  { code: "TW-PEN", nameLocal: "澎湖縣", nameEn: "Penghu" },
  { code: "TW-KIN", nameLocal: "金門縣", nameEn: "Kinmen" },
  { code: "TW-LIE", nameLocal: "連江縣", nameEn: "Lienchiang" },
];

// ── US admin1 (50 states + DC) ─────────────────────────────────────────────

const US_ADMIN1: readonly AdminEntry[] = [
  { code: "AL", nameLocal: "Alabama", nameEn: "Alabama" },
  { code: "AK", nameLocal: "Alaska", nameEn: "Alaska" },
  { code: "AZ", nameLocal: "Arizona", nameEn: "Arizona" },
  { code: "AR", nameLocal: "Arkansas", nameEn: "Arkansas" },
  { code: "CA", nameLocal: "California", nameEn: "California" },
  { code: "CO", nameLocal: "Colorado", nameEn: "Colorado" },
  { code: "CT", nameLocal: "Connecticut", nameEn: "Connecticut" },
  { code: "DE", nameLocal: "Delaware", nameEn: "Delaware" },
  { code: "DC", nameLocal: "District of Columbia", nameEn: "District of Columbia" },
  { code: "FL", nameLocal: "Florida", nameEn: "Florida" },
  { code: "GA", nameLocal: "Georgia", nameEn: "Georgia" },
  { code: "HI", nameLocal: "Hawaii", nameEn: "Hawaii" },
  { code: "ID", nameLocal: "Idaho", nameEn: "Idaho" },
  { code: "IL", nameLocal: "Illinois", nameEn: "Illinois" },
  { code: "IN", nameLocal: "Indiana", nameEn: "Indiana" },
  { code: "IA", nameLocal: "Iowa", nameEn: "Iowa" },
  { code: "KS", nameLocal: "Kansas", nameEn: "Kansas" },
  { code: "KY", nameLocal: "Kentucky", nameEn: "Kentucky" },
  { code: "LA", nameLocal: "Louisiana", nameEn: "Louisiana" },
  { code: "ME", nameLocal: "Maine", nameEn: "Maine" },
  { code: "MD", nameLocal: "Maryland", nameEn: "Maryland" },
  { code: "MA", nameLocal: "Massachusetts", nameEn: "Massachusetts" },
  { code: "MI", nameLocal: "Michigan", nameEn: "Michigan" },
  { code: "MN", nameLocal: "Minnesota", nameEn: "Minnesota" },
  { code: "MS", nameLocal: "Mississippi", nameEn: "Mississippi" },
  { code: "MO", nameLocal: "Missouri", nameEn: "Missouri" },
  { code: "MT", nameLocal: "Montana", nameEn: "Montana" },
  { code: "NE", nameLocal: "Nebraska", nameEn: "Nebraska" },
  { code: "NV", nameLocal: "Nevada", nameEn: "Nevada" },
  { code: "NH", nameLocal: "New Hampshire", nameEn: "New Hampshire" },
  { code: "NJ", nameLocal: "New Jersey", nameEn: "New Jersey" },
  { code: "NM", nameLocal: "New Mexico", nameEn: "New Mexico" },
  { code: "NY", nameLocal: "New York", nameEn: "New York" },
  { code: "NC", nameLocal: "North Carolina", nameEn: "North Carolina" },
  { code: "ND", nameLocal: "North Dakota", nameEn: "North Dakota" },
  { code: "OH", nameLocal: "Ohio", nameEn: "Ohio" },
  { code: "OK", nameLocal: "Oklahoma", nameEn: "Oklahoma" },
  { code: "OR", nameLocal: "Oregon", nameEn: "Oregon" },
  { code: "PA", nameLocal: "Pennsylvania", nameEn: "Pennsylvania" },
  { code: "RI", nameLocal: "Rhode Island", nameEn: "Rhode Island" },
  { code: "SC", nameLocal: "South Carolina", nameEn: "South Carolina" },
  { code: "SD", nameLocal: "South Dakota", nameEn: "South Dakota" },
  { code: "TN", nameLocal: "Tennessee", nameEn: "Tennessee" },
  { code: "TX", nameLocal: "Texas", nameEn: "Texas" },
  { code: "UT", nameLocal: "Utah", nameEn: "Utah" },
  { code: "VT", nameLocal: "Vermont", nameEn: "Vermont" },
  { code: "VA", nameLocal: "Virginia", nameEn: "Virginia" },
  { code: "WA", nameLocal: "Washington", nameEn: "Washington" },
  { code: "WV", nameLocal: "West Virginia", nameEn: "West Virginia" },
  { code: "WI", nameLocal: "Wisconsin", nameEn: "Wisconsin" },
  { code: "WY", nameLocal: "Wyoming", nameEn: "Wyoming" },
];

// ── Country definitions ────────────────────────────────────────────────────

const KR_SCHEMA: CountrySchema = {
  code: "KR",
  nameEn: "South Korea",
  nameKo: "대한민국",
  aliases: ["대한민국", "한국", "Korea", "Republic of Korea", "KR", "South Korea"],
  fields: ["admin1", "city", "admin2", "line1", "line2", "postal"],
  fieldLabels: {
    admin1: { ko: "시/도", en: "State/Province" },
    admin2: { ko: "구/군", en: "District" },
    city: { ko: "시", en: "City" },
  },
  required: ["admin1", "line1", "postal"],
  postalRegex: "^\\d{5}$",
  postalPlaceholder: "06236",
  admin1: KR_ADMIN1,
};

const JP_SCHEMA: CountrySchema = {
  code: "JP",
  nameEn: "Japan",
  nameKo: "일본",
  aliases: ["日本", "Japan", "JP", "일본", "にほん"],
  fields: ["postal", "admin1", "city", "admin2", "line1", "line2"],
  fieldLabels: {
    admin2: { ko: "구/시", en: "Ward/City" },
  },
  required: ["postal", "admin1", "line1"],
  postalRegex: "^\\d{3}-?\\d{4}$",
  postalPlaceholder: "150-0001",
  admin1: JP_ADMIN1,
};

const CN_SCHEMA: CountrySchema = {
  code: "CN",
  nameEn: "China",
  nameKo: "중국",
  aliases: ["中国", "China", "CN", "중국", "中華人民共和國"],
  fields: ["admin1", "city", "admin2", "line1", "line2", "postal"],
  fieldLabels: {
    admin2: { ko: "구(区)", en: "District" },
  },
  required: ["admin1", "city", "line1", "postal"],
  postalRegex: "^\\d{6}$",
  postalPlaceholder: "100000",
  admin1: CN_ADMIN1,
  postalAutoFill: CN_POSTAL_AUTOFILL,
};

const TW_SCHEMA: CountrySchema = {
  code: "TW",
  nameEn: "Taiwan",
  nameKo: "대만",
  aliases: ["臺灣", "台灣", "Taiwan", "TW", "대만", "타이완"],
  fields: ["postal", "admin1", "city", "line1", "line2"],
  required: ["postal", "admin1", "line1"],
  postalRegex: "^\\d{3}(\\d{2,3})?$",
  postalPlaceholder: "100",
  admin1: TW_ADMIN1,
};

const HK_SCHEMA: CountrySchema = {
  code: "HK",
  nameEn: "Hong Kong",
  nameKo: "홍콩",
  aliases: ["香港", "Hong Kong", "HK", "홍콩"],
  // No postal — HK has no postcode system.
  fields: ["admin2", "line1", "line2"],
  fieldLabels: {
    admin2: { ko: "구역", en: "District" },
  },
  required: ["admin2", "line1"],
  admin1: HK_DISTRICTS,
};

const SG_SCHEMA: CountrySchema = {
  code: "SG",
  nameEn: "Singapore",
  nameKo: "싱가포르",
  aliases: ["Singapore", "SG", "싱가포르", "新加坡"],
  fields: ["postal", "line1", "line2"],
  required: ["postal", "line1"],
  postalRegex: "^\\d{6}$",
  postalPlaceholder: "238858",
};

const US_SCHEMA: CountrySchema = {
  code: "US",
  nameEn: "United States",
  nameKo: "미국",
  aliases: ["United States", "USA", "US", "America", "미국"],
  fields: ["admin1", "city", "admin2", "line1", "line2", "postal"],
  fieldLabels: {
    admin2: { ko: "카운티", en: "County" },
  },
  required: ["admin1", "city", "line1", "postal"],
  postalRegex: "^\\d{5}(-\\d{4})?$",
  postalPlaceholder: "94103",
  admin1: US_ADMIN1,
};

const CA_SCHEMA: CountrySchema = {
  code: "CA",
  nameEn: "Canada",
  nameKo: "캐나다",
  aliases: ["Canada", "CA", "캐나다"],
  fields: ["admin1", "city", "line1", "line2", "postal"],
  required: ["admin1", "city", "line1", "postal"],
  postalRegex: "^[A-Za-z]\\d[A-Za-z][ -]?\\d[A-Za-z]\\d$",
  postalPlaceholder: "M5V 3L9",
};

const GB_SCHEMA: CountrySchema = {
  code: "GB",
  nameEn: "United Kingdom",
  nameKo: "영국",
  aliases: ["United Kingdom", "UK", "GB", "Britain", "England", "영국"],
  fields: ["admin1", "city", "line1", "line2", "postal"],
  fieldLabels: {
    admin1: { ko: "주(County)", en: "County" },
  },
  required: ["city", "line1", "postal"],
  postalRegex: "^[A-Za-z]{1,2}\\d[A-Za-z\\d]?\\s*\\d[A-Za-z]{2}$",
  postalPlaceholder: "SW1A 1AA",
};

const AU_SCHEMA: CountrySchema = {
  code: "AU",
  nameEn: "Australia",
  nameKo: "호주",
  aliases: ["Australia", "AU", "호주"],
  fields: ["admin1", "city", "line1", "line2", "postal"],
  required: ["admin1", "city", "line1", "postal"],
  postalRegex: "^\\d{4}$",
  postalPlaceholder: "2000",
};

const NZ_SCHEMA: CountrySchema = {
  code: "NZ",
  nameEn: "New Zealand",
  nameKo: "뉴질랜드",
  aliases: ["New Zealand", "NZ", "뉴질랜드"],
  fields: ["admin1", "city", "line1", "line2", "postal"],
  required: ["city", "line1", "postal"],
  postalRegex: "^\\d{4}$",
  postalPlaceholder: "1010",
};

const DE_SCHEMA: CountrySchema = {
  code: "DE",
  nameEn: "Germany",
  nameKo: "독일",
  aliases: ["Germany", "Deutschland", "DE", "독일"],
  fields: ["admin1", "city", "line1", "line2", "postal"],
  required: ["city", "line1", "postal"],
  postalRegex: "^\\d{5}$",
  postalPlaceholder: "10115",
};

const FR_SCHEMA: CountrySchema = {
  code: "FR",
  nameEn: "France",
  nameKo: "프랑스",
  aliases: ["France", "FR", "프랑스"],
  fields: ["admin1", "city", "line1", "line2", "postal"],
  required: ["city", "line1", "postal"],
  postalRegex: "^\\d{5}$",
  postalPlaceholder: "75001",
};

const IT_SCHEMA: CountrySchema = {
  code: "IT",
  nameEn: "Italy",
  nameKo: "이탈리아",
  aliases: ["Italy", "Italia", "IT", "이탈리아"],
  fields: ["admin1", "city", "line1", "line2", "postal"],
  required: ["city", "line1", "postal"],
  postalRegex: "^\\d{5}$",
  postalPlaceholder: "00100",
};

const ES_SCHEMA: CountrySchema = {
  code: "ES",
  nameEn: "Spain",
  nameKo: "스페인",
  aliases: ["Spain", "España", "ES", "스페인"],
  fields: ["admin1", "city", "line1", "line2", "postal"],
  required: ["city", "line1", "postal"],
  postalRegex: "^\\d{5}$",
  postalPlaceholder: "28001",
};

export const FALLBACK_COUNTRY: CountrySchema = {
  code: "ZZ",
  nameEn: "Other",
  nameKo: "기타",
  aliases: ["Other", "기타"],
  fields: ["admin1", "city", "line1", "line2", "postal"],
  required: ["line1"],
};

export const COUNTRIES: readonly CountrySchema[] = [
  KR_SCHEMA,
  JP_SCHEMA,
  CN_SCHEMA,
  TW_SCHEMA,
  HK_SCHEMA,
  SG_SCHEMA,
  US_SCHEMA,
  CA_SCHEMA,
  GB_SCHEMA,
  AU_SCHEMA,
  NZ_SCHEMA,
  DE_SCHEMA,
  FR_SCHEMA,
  IT_SCHEMA,
  ES_SCHEMA,
];

export const COUNTRY_BY_CODE: Map<string, CountrySchema> = new Map(
  COUNTRIES.map((c) => [c.code, c]),
);

export function getCountrySchema(code: string | undefined | null): CountrySchema {
  if (!code) return FALLBACK_COUNTRY;
  return COUNTRY_BY_CODE.get(code.toUpperCase()) ?? FALLBACK_COUNTRY;
}

import { getChoseong } from "es-hangul";

const HANGUL_CHOSUNG_RE = /^[ㄱ-ㅎ]+$/;

function chosungIncludes(text: string, query: string): boolean {
  return getChoseong(text).includes(query);
}

export function searchCountries(query: string, locale: "ko" | "en"): readonly CountrySchema[] {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRIES;
  const isChosungQuery = HANGUL_CHOSUNG_RE.test(query.trim());
  const matches: CountrySchema[] = [];
  for (const c of COUNTRIES) {
    const primary = (locale === "ko" ? c.nameKo : c.nameEn).toLowerCase();
    if (primary.startsWith(q) || c.code.toLowerCase() === q) {
      matches.push(c);
      continue;
    }
    if (c.nameKo.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q)) {
      matches.push(c);
      continue;
    }
    if (c.aliases.some((a) => a.toLowerCase().includes(q))) {
      matches.push(c);
      continue;
    }
    if (isChosungQuery && chosungIncludes(c.nameKo, query.trim())) {
      matches.push(c);
    }
  }
  return matches;
}

/**
 * Match a Korean admin entry (시/도 or 시/군/구) by its local name.
 * Supports plain substring on nameLocal/nameEn AND chosung-only queries
 * such as "ㅅㅇ" → "서울". Used by KR cascading dropdowns.
 */
export function matchKoreanAdmin(entry: AdminEntry, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const lower = q.toLowerCase();
  if (entry.nameLocal.toLowerCase().includes(lower)) return true;
  if (entry.nameEn.toLowerCase().includes(lower)) return true;
  if (HANGUL_CHOSUNG_RE.test(q) && chosungIncludes(entry.nameLocal, q)) return true;
  return false;
}

export function isValidPostal(schema: CountrySchema, value: string): boolean {
  if (!schema.postalRegex) return true;
  if (!value) return !schema.required.includes("postal");
  try {
    return new RegExp(schema.postalRegex).test(value);
  } catch {
    return true;
  }
}

export function getFieldLabel(
  schema: CountrySchema,
  key: AddressFieldKey,
  locale: "ko" | "en",
): string {
  const custom = schema.fieldLabels?.[key];
  if (custom) return locale === "ko" ? custom.ko : custom.en;
  const defaults: Record<AddressFieldKey, { ko: string; en: string }> = {
    admin1: { ko: "주/도", en: "State/Province" },
    admin2: { ko: "구/군", en: "District" },
    city: { ko: "도시", en: "City" },
    line1: { ko: "상세 주소", en: "Street address" },
    line2: { ko: "상세 주소 2", en: "Apt, suite, etc." },
    postal: { ko: "우편번호", en: "Postal code" },
  };
  return locale === "ko" ? defaults[key].ko : defaults[key].en;
}
