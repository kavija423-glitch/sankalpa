import type { SyllabusUnit } from '../types/app';

const mkSub = (
  id: string,
  code: string,
  titleEn: string,
  titleSi: string,
  mastery: 'not_started' | 'learning' | 'revised' | 'mastered' = 'not_started',
  confidence: number = 3,
  revisionCount: number = 0
) => ({
  id,
  code,
  titleEn,
  titleSi,
  mastery,
  confidence,
  revisionCount,
  notes: '',
  updatedAt: 1700000000000,
});

export function buildBilingualSyllabusSeed(): SyllabusUnit[] {
  return [
    // ================= PHYSICS (Units 1-11) =================
    {
      id: 'phy_u1',
      subject: 'physics',
      unitNumber: 1,
      titleEn: 'Measurement',
      titleSi: 'මිනුම්',
      subtopics: [
        mkSub('phy_1_1', '1.1', 'Physical Quantities & SI Units', 'භෞතික රාශි සහ SI ඒකක', 'mastered', 5, 3),
        mkSub('phy_1_2', '1.2', 'Dimensional Analysis & Homogeneity', 'මාන විශ්ලේෂණය', 'mastered', 4, 2),
        mkSub('phy_1_3', '1.3', 'Vernier Caliper, Micrometer Screw Gauge & Errors', 'වර්නියර් කැලිපරය, මයික්‍රොමීටර ඉස්කුරුප්පු ආමානය සහ දෝෂ', 'revised', 4, 2),
      ],
    },
    {
      id: 'phy_u2',
      subject: 'physics',
      unitNumber: 2,
      titleEn: 'Mechanics',
      titleSi: 'යාන්ත්‍ර විද්‍යාව',
      subtopics: [
        mkSub('phy_2_1', '2.1', 'Kinematics & Projectile Motion', 'චලිත විද්‍යාව සහ ප්‍රක්ෂිප්ත චලිතය', 'mastered', 4, 2),
        mkSub('phy_2_2', '2.2', 'Newton’s Laws, Momentum & Collisions', 'නිව්ටන්ගේ නියම, ගම්‍යතාව සහ ගැටුම්', 'revised', 4, 1),
        mkSub('phy_2_3', '2.3', 'Work, Energy, Power & Rotational Dynamics', 'කාර්යය, ශක්තිය, ක්ෂමතාව සහ භ්‍රමණ ගතිකය', 'learning', 3, 1),
        mkSub('phy_2_4', '2.4', 'Fluid Mechanics & Bernoulli’s Principle', 'තරල යාන්ත්‍ර විද්‍යාව සහ බර්නුලී මූලධර්මය', 'learning', 2, 0),
      ],
    },
    {
      id: 'phy_u3',
      subject: 'physics',
      unitNumber: 3,
      titleEn: 'Oscillations & Waves',
      titleSi: 'දෝලන සහ තරංග',
      subtopics: [
        mkSub('phy_3_1', '3.1', 'Simple Harmonic Motion (SHM)', 'සරල අනුවර්තී චලිතය', 'revised', 4, 2),
        mkSub('phy_3_2', '3.2', 'Stationary Waves, Resonance & Doppler Effect', 'ස්ථාවර තරංග, අනුනාදය සහ ඩොප්ලර් ආචරණය', 'learning', 3, 1),
        mkSub('phy_3_3', '3.3', 'Geometrical Optics & Optical Instruments', 'ජ්‍යාමිතික ප්‍රකාශ විද්‍යාව සහ ප්‍රකාශ උපකරණ', 'not_started', 2, 0),
      ],
    },
    {
      id: 'phy_u4',
      subject: 'physics',
      unitNumber: 4,
      titleEn: 'Thermal Physics',
      titleSi: 'තාප භෞතික විද්‍යාව',
      subtopics: [
        mkSub('phy_4_1', '4.1', 'Thermal Expansion & Ideal Gas Laws', 'තාප ප්‍රසාරණය සහ පරිපූර්ණ වායු නියම', 'revised', 4, 1),
        mkSub('phy_4_2', '4.2', 'Calorimetry, Change of State & Humidity', 'කැලරිමිතිය, අවස්ථා විපර්යාස සහ ආර්ද්‍රතාව', 'learning', 3, 1),
        mkSub('phy_4_3', '4.3', 'Laws of Thermodynamics & Heat Transfer', 'තාප ගති විද්‍යාවේ නියම සහ තාප සංක්‍රමණය', 'not_started', 2, 0),
      ],
    },
    {
      id: 'phy_u5',
      subject: 'physics',
      unitNumber: 5,
      titleEn: 'Gravitational Field',
      titleSi: 'ගුරුත්වාකර්ෂණ ක්ෂේත්‍රය',
      subtopics: [
        mkSub('phy_5_1', '5.1', 'Newton’s Law of Gravitation & Field Intensity', 'සර්වත්‍ර ගුරුත්වාකර්ෂණ නියමය සහ ක්ෂේත්‍ර තීව්‍රතාව', 'revised', 4, 1),
        mkSub('phy_5_2', '5.2', 'Gravitational Potential, Satellites & Escape Velocity', 'ගුරුත්වාකර්ෂණ විභවය, චන්ද්‍රිකා සහ වියෝග ප්‍රවේගය', 'learning', 3, 0),
      ],
    },
    {
      id: 'phy_u6',
      subject: 'physics',
      unitNumber: 6,
      titleEn: 'Electrostatic Field',
      titleSi: 'ස්ථිති විද්‍යුත් ක්ෂේත්‍රය',
      subtopics: [
        mkSub('phy_6_1', '6.1', 'Coulomb’s Law, Gauss’s Law & Electric Potential', 'කූලෝම් නියමය, ගවුස් නියමය සහ විද්‍යුත් විභවය', 'learning', 3, 1),
        mkSub('phy_6_2', '6.2', 'Capacitors & Dielectric Energy Storage', 'ධාරිත්‍රක සහ පාරවිද්‍යුත් ශක්ති ගබඩා කිරීම', 'learning', 2, 0),
      ],
    },
    {
      id: 'phy_u7',
      subject: 'physics',
      unitNumber: 7,
      titleEn: 'Magnetic Field',
      titleSi: 'චුම්බක ක්ෂේත්‍රය',
      subtopics: [
        mkSub('phy_7_1', '7.1', 'Biot-Savart Law & Force on Moving Charges', 'බයෝ-සවාට් නියමය සහ චලනය වන ආරෝපණ මත බලය', 'learning', 3, 1),
        mkSub('phy_7_2', '7.2', 'Electromagnetic Induction (Faraday & Lenz Laws)', 'විද්‍යුත් චුම්බක ප්‍රේරණය (ෆැරඩේ සහ ලෙන්ස් නියම)', 'not_started', 2, 0),
      ],
    },
    {
      id: 'phy_u8',
      subject: 'physics',
      unitNumber: 8,
      titleEn: 'Current Electricity',
      titleSi: 'ධාරා විද්‍යුතය',
      subtopics: [
        mkSub('phy_8_1', '8.1', 'Kirchhoff’s Laws, Wheatstone Bridge & Potentiometer', 'කර්චොෆ් නියම, වීට්ස්ටන් සේතුව සහ විභවමානය', 'revised', 4, 2),
        mkSub('phy_8_2', '8.2', 'EMF, Internal Resistance & Electrical Power', 'වි.ගා.බ., අභ්‍යන්තර ප්‍රතිරෝධය සහ විද්‍යුත් ක්ෂමතාව', 'mastered', 5, 2),
      ],
    },
    {
      id: 'phy_u9',
      subject: 'physics',
      unitNumber: 9,
      titleEn: 'Electronics',
      titleSi: 'ඉලෙක්ට්‍රොනික විද්‍යාව',
      subtopics: [
        mkSub('phy_9_1', '9.1', 'p-n Junction Diodes & Rectification', 'p-n සන්ධි ඩයෝඩ සහ ඍජුකරණය', 'learning', 3, 1),
        mkSub('phy_9_2', '9.2', 'BJT Transistors & Operational Amplifiers (Op-Amp)', 'BJT ට්‍රාන්සිස්ටර සහ කාරකාත්මක වර්ධක', 'not_started', 2, 0),
      ],
    },
    {
      id: 'phy_u10',
      subject: 'physics',
      unitNumber: 10,
      titleEn: 'Mechanical Properties of Matter',
      titleSi: 'පදාර්ථයේ යාන්ත්‍රික ගුණ',
      subtopics: [
        mkSub('phy_10_1', '10.1', 'Elasticity, Young’s Modulus & Stress-Strain', 'ප්‍රත්‍යස්ථතාව සහ යං මාපාංකය', 'revised', 4, 1),
        mkSub('phy_10_2', '10.2', 'Viscosity & Surface Tension', 'දුස්ස්‍රාවීතාව සහ පෘෂ්ඨික ආතතිය', 'not_started', 2, 0),
      ],
    },
    {
      id: 'phy_u11',
      subject: 'physics',
      unitNumber: 11,
      titleEn: 'Matter & Radiation',
      titleSi: 'පදාර්ථය සහ විකිරණය',
      subtopics: [
        mkSub('phy_11_1', '11.1', 'Photoelectric Effect & X-Rays', 'ප්‍රකාශ විද්‍යුත් ආචරණය සහ X-කිරණ', 'learning', 3, 0),
        mkSub('phy_11_2', '11.2', 'Radioactivity, Half-Life & Nuclear Energy', 'විකිරණශීලීතාව, අර්ධ ආයු කාලය සහ න්‍යෂ්ටික ශක්තිය', 'not_started', 2, 0),
      ],
    },

    // ================= COMBINED MATHEMATICS =================
    {
      id: 'math_u1',
      subject: 'maths',
      unitNumber: 1,
      titleEn: 'Pure · Real Numbers, Quadratics & Polynomials',
      titleSi: 'ශුද්ධ · තාත්වික සංඛ්‍යා, වර්ගජ සමීකරණ සහ බහුපද',
      subtopics: [
        mkSub('math_1_1', 'P1.1', 'Quadratic Equations & Nature of Roots', 'වර්ගජ සමීකරණ සහ මූලවල ස්වභාවය', 'mastered', 5, 3),
        mkSub('math_1_2', 'P1.2', 'Remainder Theorem, Partial Fractions & Inequalities', 'ශේෂ ප්‍රමේයය, ආංශික භාග සහ අසමානතා', 'revised', 4, 2),
      ],
    },
    {
      id: 'math_u2',
      subject: 'maths',
      unitNumber: 2,
      titleEn: 'Pure · Series, Permutations & Binomial Theorem',
      titleSi: 'ශුද්ධ · ශ්‍රේණි, සංකරණ, සංයෝජන සහ ද්විපද ප්‍රමේයය',
      subtopics: [
        mkSub('math_2_1', 'P2.1', 'Mathematical Induction & Sigma Notation', 'ගණිත අභ්‍යුහනය සහ සිග්මා අංකනය', 'revised', 4, 2),
        mkSub('math_2_2', 'P2.2', 'Permutations, Combinations & Binomial Expansion', 'සංකරණ, සංයෝජන සහ ද්විපද ප්‍රසාරණය', 'learning', 3, 1),
      ],
    },
    {
      id: 'math_u3',
      subject: 'maths',
      unitNumber: 3,
      titleEn: 'Pure · Trigonometry & Coordinate Geometry',
      titleSi: 'ශුද්ධ · ත්‍රිකෝණමිතිය සහ ඛණ්ඩාංක ජ්‍යාමිතිය',
      subtopics: [
        mkSub('math_3_1', 'P3.1', 'Trigonometric Identities & General Solutions', 'ත්‍රිකෝණමිතික සර්වසාම්‍ය සහ සාධාරණ විසඳුම්', 'revised', 4, 2),
        mkSub('math_3_2', 'P3.2', 'Straight Line, Family of Lines & Circle', 'සරල රේඛාව සහ වෘත්තය', 'learning', 3, 1),
      ],
    },
    {
      id: 'math_u4',
      subject: 'maths',
      unitNumber: 4,
      titleEn: 'Pure · Calculus (Limits, Differentiation & Integration)',
      titleSi: 'ශුද්ධ · කලනය (සීමා, අවකලනය සහ අනුකලනය)',
      subtopics: [
        mkSub('math_4_1', 'P4.1', 'Limits, Continuity & Curve Sketching', 'සීමා, සන්තතිකතාව සහ වක්‍ර රේඛා සටහන්', 'revised', 4, 2),
        mkSub('math_4_2', 'P4.2', 'Integration by Substitution, Parts & Definite Integrals', 'ආදේශ, කොටස් වශයෙන් අනුකලනය සහ නිශ්චිත අනුකල', 'learning', 3, 1),
        mkSub('math_4_3', 'P4.3', 'First-Order Differential Equations', 'පළමු ගණයේ අවකල සමීකරණ', 'not_started', 2, 0),
      ],
    },
    {
      id: 'math_u5',
      subject: 'maths',
      unitNumber: 5,
      titleEn: 'Pure · Complex Numbers & Matrices',
      titleSi: 'ශුද්ධ · සංකීර්ණ සංඛ්‍යා සහ න්‍යාස',
      subtopics: [
        mkSub('math_5_1', 'P5.1', 'Argand Diagram & De Moivre’s Theorem', 'ආගන්ඩ් තලය සහ ඩි මෝවර් ප්‍රමේයය', 'learning', 3, 1),
        mkSub('math_5_2', 'P5.2', 'Matrices, Determinants & Linear Systems', 'න්‍යාස, නිශ්චායක සහ ඒකජ සමීකරණ පද්ධති', 'not_started', 2, 0),
      ],
    },
    {
      id: 'math_u6',
      subject: 'maths',
      unitNumber: 6,
      titleEn: 'Applied · Vectors, Kinematics & Relative Motion',
      titleSi: 'ව්‍යවහාරික · දෛශික, චලිත විද්‍යාව සහ සාපේක්ෂ ප්‍රවේගය',
      subtopics: [
        mkSub('math_6_1', 'A1.1', 'Vector Algebra & Coplanar Forces', 'දෛශික වීජ ගණිතය සහ ඒකතල බල', 'revised', 4, 2),
        mkSub('math_6_2', 'A1.2', 'Relative Velocity & Projectiles on Inclined Planes', 'සාපේක්ෂ ප්‍රවේගය සහ ආනත තල මත ප්‍රක්ෂිප්ත', 'learning', 3, 1),
      ],
    },
    {
      id: 'math_u7',
      subject: 'maths',
      unitNumber: 7,
      titleEn: 'Applied · Dynamics, Friction, Statics & Circular Motion',
      titleSi: 'ව්‍යවහාරික · ගතිකය, ඝර්ෂණය, ස්ථිතිකය සහ වෘත්තාකාර චලිතය',
      subtopics: [
        mkSub('math_7_1', 'A2.1', 'Equilibrium of Rigid Bodies & Friction', 'දෘඪ වස්තූන්ගේ සමතුලිතතාව සහ ඝර්ෂණය', 'learning', 3, 1),
        mkSub('math_7_2', 'A2.2', 'Impulse, Direct Impact & Vertical Circular Motion', 'ආවේගය, ඍජු ගැටුම් සහ සිරස් වෘත්තාකාර චලිතය', 'not_started', 2, 0),
      ],
    },
    {
      id: 'math_u8',
      subject: 'maths',
      unitNumber: 8,
      titleEn: 'Applied · Probability & Statistics',
      titleSi: 'ව්‍යවහාරික · සම්භාවිතාව සහ සංඛ්‍යානය',
      subtopics: [
        mkSub('math_8_1', 'A3.1', 'Conditional Probability & Bayes’ Theorem', 'කොන්දේසි සහිත සම්භාවිතාව සහ බේස් ප්‍රමේයය', 'learning', 3, 1),
        mkSub('math_8_2', 'A3.2', 'Measures of Central Tendency & Dispersion', 'කේන්ද්‍රික ප්‍රවණතා සහ විසිරුම් මිනුම්', 'revised', 4, 1),
      ],
    },

    // ================= ICT (Units 1-11) =================
    {
      id: 'ict_u1',
      subject: 'ict',
      unitNumber: 1,
      titleEn: 'Concept of ICT & Data Representation',
      titleSi: 'තොරතුරු හා සන්නිවේදන තාක්ෂණය සහ දත්ත නිරූපණය',
      subtopics: [
        mkSub('ict_1_1', '1.1', 'Binary, Octal, Hexadecimal & Two’s Complement', 'ද්වීමය, අෂ්ටමය, ෂඩ්දශමය සහ දෙකේ අනුපූරකය', 'mastered', 5, 3),
        mkSub('ict_1_2', '1.2', 'ASCII, Unicode & Character Encoding', 'ASCII, යුනිකෝඩ් සහ අක්ෂර කේතීකරණය', 'mastered', 5, 2),
      ],
    },
    {
      id: 'ict_u2',
      subject: 'ict',
      unitNumber: 2,
      titleEn: 'Digital Logic & Boolean Algebra',
      titleSi: 'තර්ක ද්වාර සහ බූලීය වීජ ගණිතය',
      subtopics: [
        mkSub('ict_2_1', '2.1', 'Logic Gates, Truth Tables & De Morgan’s Laws', 'තර්ක ද්වාර, සත්‍යතා වගු සහ ඩි මෝගන් නියම', 'revised', 4, 2),
        mkSub('ict_2_2', '2.2', 'Karnaugh Maps (K-Maps) & Half/Full Adders', 'කානෝ සිතියම් සහ අර්ධ/පූර්ණ ආකලක', 'learning', 3, 1),
      ],
    },
    {
      id: 'ict_u3',
      subject: 'ict',
      unitNumber: 3,
      titleEn: 'Operating Systems & Computer Architecture',
      titleSi: 'මෙහෙයුම් පද්ධති සහ පරිගණක නිර්මාණ ශිල්පය',
      subtopics: [
        mkSub('ict_3_1', '3.1', 'Fetch-Execute Cycle, Registers & Cache Memory', 'උපදෙස් ක්‍රියාත්මක චක්‍රය, රෙජිස්ටර සහ නිහිත මතකය', 'revised', 4, 1),
        mkSub('ict_3_2', '3.2', 'Process States, Scheduling & Virtual Memory', 'ක්‍රියාවලි අවස්ථා, කාලසටහන්ගත කිරීම සහ අතථ්‍ය මතකය', 'learning', 3, 1),
      ],
    },
    {
      id: 'ict_u4',
      subject: 'ict',
      unitNumber: 4,
      titleEn: 'Data Communication & Networking',
      titleSi: 'දත්ත සන්නිවේදනය සහ පරිගණක ජාල',
      subtopics: [
        mkSub('ict_4_1', '4.1', 'OSI 7-Layer Model & TCP/IP Suite', 'OSI ස්ථර 7 ආකෘතිය සහ TCP/IP', 'revised', 4, 2),
        mkSub('ict_4_2', '4.2', 'IPv4 Subnetting, CIDR & Routing', 'IPv4 උපජාලකරණය සහ මාර්ගගත කිරීම', 'learning', 3, 1),
      ],
    },
    {
      id: 'ict_u5',
      subject: 'ict',
      unitNumber: 5,
      titleEn: 'Database Management Systems (DBMS)',
      titleSi: 'දත්ත සමුදා කළමනාකරණ පද්ධති',
      subtopics: [
        mkSub('ict_5_1', '5.1', 'ER / EER Diagrams & Relational Mapping', 'ER සටහන් සහ සම්බන්ධතා වගු ගොඩනැගීම', 'revised', 4, 2),
        mkSub('ict_5_2', '5.2', 'Normalization (1NF, 2NF, 3NF) & SQL Queries', 'ප්‍රමතකරණය (1NF–3NF) සහ SQL විමසුම්', 'learning', 3, 1),
      ],
    },
    {
      id: 'ict_u6',
      subject: 'ict',
      unitNumber: 6,
      titleEn: 'Programming in Python & Algorithms',
      titleSi: 'පයිතන් ක්‍රමලේඛනය සහ ඇල්ගොරිතම',
      subtopics: [
        mkSub('ict_6_1', '6.1', 'Flowcharts, Pseudocode & Complexity', 'ගැලීම් සටහන් සහ ව්‍යාජ කේත', 'mastered', 5, 2),
        mkSub('ict_6_2', '6.2', 'Python Lists, Dictionaries, Functions & File I/O', 'Python ලැයිස්තු, ශබ්දකෝෂ, ශ්‍රිත සහ ගොනු හැසිරවීම', 'revised', 4, 2),
      ],
    },
    {
      id: 'ict_u7',
      subject: 'ict',
      unitNumber: 7,
      titleEn: 'Web Development (HTML, CSS, PHP & MySQL)',
      titleSi: 'වෙබ් අඩවි නිර්මාණය (HTML, CSS, PHP සහ MySQL)',
      subtopics: [
        mkSub('ict_7_1', '7.1', 'Semantic HTML5 Forms, Tables & CSS Selectors', 'HTML5 ආකෘතිපත්‍ර, වගු සහ CSS', 'revised', 4, 1),
        mkSub('ict_7_2', '7.2', 'Server-Side PHP & MySQL Integration', 'PHP සහ MySQL සම්බන්ධතාව', 'learning', 3, 0),
      ],
    },
    {
      id: 'ict_u8',
      subject: 'ict',
      unitNumber: 8,
      titleEn: 'Systems Analysis, SDLC & IoT',
      titleSi: 'පද්ධති විශ්ලේෂණය, SDLC සහ IoT',
      subtopics: [
        mkSub('ict_8_1', '8.1', 'SDLC Models, DFD & Feasibility Study', 'පද්ධති සංවර්ධන ජීවන චක්‍රය සහ DFD', 'learning', 3, 1),
        mkSub('ict_8_2', '8.2', 'Arduino / IoT Sensors & E-Commerce Security', 'IoT සංවේදක සහ විද්‍යුත් වාණිජ්‍ය ආරක්ෂාව', 'not_started', 2, 0),
      ],
    },
  ];
}
