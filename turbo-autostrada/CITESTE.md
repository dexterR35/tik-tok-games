# 🏁 TURBOSTRADA / HIGHWAY TURBO – joc runner 3D pentru TikTok LIVE

Spectatorii intră în cursă cu avatarul lor și aleargă pe o autostradă prin oraș. Aleargă singuri: sar peste bariere, alunecă pe sub bare și ocolesc mașinile. Tu doar transmiți live.

## 4 live-uri, 4 jocuri (un live = un joc)
Poți rula fiecare joc pe live-ul lui: toate 4 deodată, pe 4 conturi TikTok, sau doar pe cel de azi.

| Pornești | Jocul | Port | Contul TikTok se scrie în |
|---|---|---|---|
| `LIVE-1-CLASIC.bat` | 🏁 Clasic | 3001 | `lives/clasic.json` |
| `LIVE-2-CHALLENGE.bat` | 🎟️ Challenge | 3002 | `lives/challenge.json` |
| `LIVE-3-ECHIPE.bat` | 🔴🔵 Echipe | 3003 | `lives/echipe.json` |
| `LIVE-4-ELIMINARE.bat` | 💀 Eliminare | 3004 | `lives/eliminare.json` |

- În fiecare fișier din `lives/` scrii numele contului: `"tiktokUsername": "contul_tau"`. Restul (cheia de semnare, parola panoului) se ia din `config.json`, dacă nu le pui și acolo.
- Fiecare live are fereastra lui de joc (titlul: „TURBOSTRADA – Clasic – clasic” etc., ca să o alegi ușor în LIVE Studio), panoul lui, setările lui, clasamentele lui (`data/clasic/`…) și logurile lui (`logs/clasic/`…).
- Jocul e **fix** (`"lockMode": true`): nu se mai poate schimba din panou sau cu `!mode`. Pui `false` dacă vrei să-l poți schimba.
- `STOP-LIVE-URI.bat` le oprește pe toate. Tunel pentru un live anume: `node tunnel.js lives/clasic.json`.
- `START.bat` merge în continuare ca înainte (un singur joc, port 3000, clasamentele vechi din `data/stats.json`).
- Patru live-uri deodată înseamnă 4 ferestre 3D pe același calculator (placa video) și 4 transmisii (internet). Fiecare cont transmite separat; un singur LIVE Studio nu poate transmite pe 4 conturi.

## Așezarea pe ecran (butoanele TikTok)
TikTok pune peste live: sus gazda și spectatorii, jos-stânga comentariile și gift-urile, jos bara cu butoane. Jocul stă între ele:
- sus (sub butoanele TikTok): logo, timp, runda, mini-pista;
- dreapta: top 5 pe coloană și fanii care dau tap;
- stânga sus: cardul jucătorului urmărit de cameră și mesajele;
- imaginea 3D e mutată puțin în sus în lobby și în cursă, iar pe podium puțin în jos (`TIKTOK_SAFE_SHIFT` în `public/js/rules.js`).

Ca să vezi cum arată pe telefon: **📱 Previzualizare cu butoanele TikTok** din panou (sau `http://localhost:3001/preview.html`). Pozițiile butoanelor TikTok sunt aproximative.

## Siguranță
- Serverul jocului răspunde **doar pe acest calculator** (127.0.0.1). Din altă parte se ajunge la el numai prin `TUNEL.bat`. Dacă vrei totuși să deschizi panoul de pe telefon prin Wi-Fi-ul de acasă, pune `"allowLan": true` în `config.json`.
- Cine intră prin link-ul public **doar privește**. Nu poate trimite gift-uri false, comenzi sau setări și nu vede panoul.
- Panoul de pe alt dispozitiv cere parola din `config.json` (`panelPassword`). După 8 parole greșite, adresa aceea e blocată 15 minute. Schimbă parola dacă ai dat-o cuiva.
- Pozele de profil se iau doar de pe serverele de poze TikTok: numai imagini, maxim 2 MB, fără redirecționări.
- Nu da nimănui `config.json` sau fișierele din `lives/`: în ele sunt parola panoului și cheia de semnare.
- Evenimentele din live (chat, tap-uri, gift-uri) vin prin biblioteca `tiktok-live-connector`, care **nu e oficială**: TikTok nu oferă o interfață publică pentru evenimentele din LIVE. Dacă TikTok schimbă ceva, conexiunea se poate opri până la o actualizare (`npm update tiktok-live-connector`). Jocul nu cere niciodată parola contului tău TikTok și nu trimite nimic în numele tău.

## Legătura cu TikTok LIVE Studio (1080×1920, 60 FPS)
LIVE Studio doar **transmite imaginea**. Evenimentele (chat, gift-uri) le citește separat serverul jocului, după numele contului.

**Recomandat: sursa „Link” (imagine clară, 1080×1920)**
1. Pornești `LIVE-1-CLASIC.bat` (sau live-ul de azi). Fereastra neagră îți arată linkul și îl copiază deja: `http://localhost:3001/?live=1`. Îl găsești și în panou, cu butonul **📋 Copiază**.
2. În LIVE Studio: scenă **portret**, apoi **Adaugă sursă → Link**, lipești linkul, dimensiunea **1080 × 1920**, și întinzi sursa pe tot ecranul.
3. Setările LIVE Studio: rezoluție **1080p**, **60 FPS**, bitrate cât permite internetul. Fără widget-uri LIVE Studio de chat sau alerte peste joc: TikTok pune singur comentariile și butoanele pe telefoane.
4. Cu `?live=1` pe ecran nu apar mesajele pentru tine (status, „apasă pentru sunet”). Butoanele TikTok din previzualizare **nu** apar niciodată în live.

**Dacă sursa Link nu merge la tine**: unii streameri raportează că apare ca un dreptunghi mic. În acest caz, în `LIVE-…bat` schimbi `set FEREASTRA=0` în `set FEREASTRA=1`. Se deschide fereastra Chrome a jocului, iar în LIVE Studio adaugi sursa **Fereastră** („TURBOSTRADA – Clasic – clasic”). Imaginea e mai puțin clară (fereastra are 540 px lățime). Nu folosi ambele deodată, pentru că își iau locul una alteia.

## Cele 4 jocuri
Sunt patru jocuri diferite pe același motor 3D. Fiecare are fișierul lui cu pașii jocului (`public/js/games/`) și blocul lui de setări în `public/js/rules.js`. Le schimbi din panou sau cu `JOC-*.bat`.

| Joc | Cum intri | Cum se termină | Cine câștigă |
|---|---|---|---|
| 🏁 **Clasic** (`games/classic.js`) | scrii orice în chat | primii 3 trec linia de sosire sau expiră timpul (5 min) | primii la sosire, apoi cei mai departe |
| 🎟️ **Challenge** (`games/challenge.js`) | gift-uri de 5+ monede = bilet | primii 3 la sosire sau expiră timpul (3 min) | concurenții cu bilet; restul sunt fani |
| 🔴🔵 **Echipe** (`games/teams.js`) | scrii culoarea echipei | ține tot timpul (4 min), **fără linie de sosire** | echipa cu cei mai mulți metri câștigați |
| 💀 **Eliminare** (`games/elimination.js`) | scrii orice în chat | tăieri la 45 s, apoi din 30 în 30 s, apoi FINALA; **fără linie de sosire** | ultimii rămași, în ordinea din finală |

Ce are fiecare în plus:
- **Clasic**: linia de sosire e pusă exact unde ajunge, în ultima secundă, cineva care dă „ținta” de tap-uri pe secundă toată cursa (3,5 tap-uri/s; cu fiecare ×10 jucători ținta crește cu 1). Fără tap sau gift nu ajunge nimeni. Cine dă mai mult decât ținta sau trimite gift-uri ajunge înainte de final.
- **Challenge**: ce plătești peste prețul biletului devine rachetă. Bilet luat în lobby sau în primele 60 s de cursă = intri acum. Bilet luat mai târziu, pe podium sau când e plin (60 de locuri) = loc rezervat în runda următoare (⏭ în colțul de sus). Fanii scriu `#numărul` unui concurent; alegerea ține o rundă. În ultimele 30 s camera face duel între primii 2.
- **Echipe**: cursa pornește când fiecare echipă are măcar un om (merge și 1 la 1). Scorul adună doar cei mai buni N din fiecare echipă, unde N = mărimea celei mai mici echipe, deci nu câștigă echipa doar pentru că are mai mulți oameni. Pe podium urcă cei mai buni 3 din echipa câștigătoare.
- **Eliminare**: merge de la 2 jucători. Durata se calculează singură: tăieri = jucători − finaliști (maxim 8). 2 jucători = o tăiere (duel de 45 s), 4 = două tăieri și finală în 2, 10.000 = 8 tăieri (pleacă ~64% la fiecare) și finală în 3. Pe șosea se vede **linia roșie**: cine e în spatele ei iese la următoarea tăiere. Eliminat? Gift de 10+ monede = revii (monedele contează și ca rachetă). În finală nu mai intră și nu mai revine nimeni; gift-ul se păstrează pentru runda următoare.

## Reguli comune
| Acțiune spectator | Efect |
|---|---|
| 💬 Comentariu | intră în cursă (cu poza de profil și numele) |
| 👆 Tap / like | energie + metri: +1 m la fiecare 3 tap-uri (apoi tot mai multe) |
| 🎁 Gift | rachete: 1 monedă = 6 m, 10 = 35 m, 100 = 156 m, 500 = 327 m |
| ➕ Follow | +3 m și pantofi turbo (o singură dată pe live) |
| 🔁 Share | +2 m (de maxim 2 ori pe rundă) |

- 🛡️ **10+ monede**: scut, sparge obstacolele (8 s).
- 🌋 **500+ monede**: SURPRIZĂ pentru toți ceilalți (meteoriți, șosea înghețată sau furtună).
- ⚡ **Energie**: scade la jumătate la fiecare 8 s fără tap. Cu energia jos robotul aleargă mai încet și se lovește mai des.
- În ultimele 30 s tap-urile valorează dublu.
- **Cine intră în timpul cursei** pornește de pe „linia celor care nu fac nimic”: exact acolo unde ar fi fost dacă intra la start și nu dădea niciun tap. Nu mai pornește de la zero, la un kilometru în spate.
- **Gift-urile nu se pierd**: trimise pe podium, după ce ai trecut linia sau când nu e loc pe pistă, se aplică în runda următoare.
- La start toți pleacă de la aceeași linie (înainte, cei vechi porneau cu ~40 m în urmă când erau peste 24 de jucători).
- Roboții desenați și cei nedesenați au aceleași șanse la obstacole și la monedele de pe pistă.

Toate cifrele se schimbă în `public/js/rules.js`. Formulele sunt în `public/js/math.js`. Ca să vezi ce înseamnă cifrele pentru 2 … 10.000 de jucători, fără să pornești jocul: `node tools/balanta.mjs`.

## De la 2 la 10.000+ de spectatori
- În joc există doar oamenii **activi**, maxim 10.000 pe pistă (`MAX_RACERS`, se schimbă și din panou). Jocul ține minte până la 60.000 de spectatori (echipa aleasă, bilet, follow), dar nu face un alergător din fiecare.
- Când pista e plină, un om nou ia locul unuia care n-a făcut nimic runda asta. Acela era oricum pe „linia celor care nu fac nimic”, deci dacă revine intră exact acolo. Cei activi nu-și pierd niciodată locul.
- Dacă toți sunt activi, cei noi așteaptă în tribună (`🏃 10k +2.3k 👥` sus) și intră primii în runda următoare.
- Pe ecran: 24 de roboți cu poză + până la 220 de siluete colorate pentru restul plutonului (un singur apel de desenare), plus harta de sus cu densitatea tuturor. În lobby mulțimea stă în rânduri în spatele roboților.
- Când camera trebuie să sară departe (de la pluton la lider), face o tăietură scurtă de montaj în loc să zboare peste tot traseul.
- Serverul strânge evenimentele 50 ms și le trimite într-un singur pachet; tap-urile aceluiași om se adună. La 10.000 de spectatori jocul primește ~20 de mesaje pe secundă, nu sute.
- Testat în simulare: runde întregi cu 10.000 de jucători în Clasic, Echipe și Eliminare (Challenge are 60 de locuri); logica unui cadru a durat în medie ~2 ms pe calculatorul de test.
- După această actualizare: închide și repornește START.bat (serverul s-a schimbat) și apasă F5 în fereastra jocului.

## Pornire (Windows)
1. Instalează **Node.js LTS** de pe https://nodejs.org (o singură dată).
2. Deschide `config.json` și scrie username-ul tău TikTok, fără @:
   ```json
   { "tiktokUsername": "numele_tau", "signApiKey": "", "port": 3000 }
   ```
   Dacă îl lași gol, jocul merge doar în mod simulare.
3. Dublu-click pe **START.bat**. Prima dată instalează pachetele (durează un minut). Apoi se deschid **două ferestre**:
   - **Jocul** (fereastră verticală, curată) → pe aceasta o capturezi în LIVE Studio.
   - **Panoul de control** (`http://localhost:3000/panel.html`) → doar pentru tine, NU îl captura. Îl poți ține pe alt monitor sau chiar pe telefon/tabletă din aceeași rețea Wi-Fi (`http://IP-ul-PC-ului:3000/panel.html`).
   Din panou: jocul, limbă, oră, Start / Termină / Rundă nouă / Pauză / Sunet, comenzi `!...`, top 5 în timp real și setările, salvate automat. Setările sunt grupate pe cele 4 jocuri (durată, numărătoare, țintă, bilet, echipe, tăieri, finală) plus cele comune (tap-uri, energie, maxim alergători, volum); jocul activ e încadrat cu galben. Secțiunile „Test” (comentarii, tap, gift-uri, bilet, fani, echipe) trimit evenimente false, care se văd și în joc, deci le folosești doar când testezi.
   Sus în panou vezi dacă jocul e conectat; dacă scrie „Nicio fereastră de joc”, deschide JOC-CLASIC.bat.
4. Pornește LIVE-ul pe TikTok. Serverul se conectează singur (reîncearcă la 20s până ești live).

## Simulator (test fără live)
Deschide `http://localhost:3000/?sim=1`. Ai butoane pentru spectatori, comentarii, tap-uri și gift-uri de 1/10/100/500, plus „Auto-public”, care simulează un live plin. Tasta **H** ascunde panoul.
Pentru calculatoare mai slabe: `http://localhost:3000/?lowfx=1` (fără umbre).

## Cum îl pui în TikTok LIVE Studio
1. Cu START.bat pornit, dă dublu-click pe **DESCHIDE-JOC.bat**. Se deschide jocul într-o fereastră Chrome verticală, fără bare.
2. În LIVE Studio adaugă o sursă de captură de fereastră și alege fereastra jocului. Pune scena în format vertical.
3. Varianta cu OBS: adaugi o sursă „Browser” cu `http://localhost:3000`, la 1080×1920.

## Grafică
- Personajele sunt roboți 3D animați (aleargă, sar, dansează pe podium). Modelul „RobotExpressive” e făcut de Tomás Laulhé și e gratuit (licență CC0).
- Efectele de lumină (bloom) și umbrele cer o placă video decentă. Dacă jocul merge greu, deschide `http://localhost:3000/?lowfx=1` sau scade `MAX_VISIBLE` în `rules.js`.

## Sunet
Sunetul e sintetizat în joc (fără fișiere): motor care urcă cu viteza liderului, whoosh la rachete, bonk la lovituri, numărătoare și claxon la start, ding la gift, fanfară pe podium, alarmă în zona roșie. Browserul pornește sunetul doar după un click în fereastră; dacă apare „click pe fereastră pentru sunet”, dă un click. Tasta **M** = mute. `?sound=0` îl oprește de tot. În LIVE Studio alege captură cu „audio desktop” ca să se audă.

## Pe ecran, în plus
- **Zidul fanilor** (dreapta): pozele celor care au dat tap în ultimele 10 secunde, cu 🔥 la serii.
- **Harta cursei** (bara de sus): toți jucătorii ca densitate pe traseu, nu doar primii 8.
- **Rival**: pe cardul de pe cameră, cel imediat în față și la câți metri. Depășirile sunt anunțate.
- **Serii**: 10 tap-uri fără pauză (sub 1,5 s între ele) aprind robotul; 30 dau +3 m.
- **Cardul de pe cameră** se schimbă după joc: Clasic / Challenge = cât mai e până la sosire și câte tap-uri sau monede lipsesc dacă te oprești acum; Echipe = câți metri ai adus echipei; Eliminare = câți metri ești peste linia roșie sau câți îți lipsesc.
- **Challenge**: contor de fani și „top fan” pe card, miza rundei în puncte de glorie (bilete × 10), iar în ultimele 30 s camera alternează între primii 2 (duel).
- **Skin-uri**: câștigătorul rundei primește skin auriu (Clasic/Echipe), de foc (Eliminare) sau coroana (Challenge), până la finalul live-ului.
- **Evenimente de traseu**: la fiecare rundă se alege ploaie, tuneluri, șantier (bariere pe toată lățimea, toți trebuie să sară) sau nimic.

## Memorie între live-uri
Serverul salvează în `data/stats.json` clasamente pe săptămână, lună și toți timpii (10/6/4/3/2/1 puncte pentru primele 6 locuri) plus titluri: 🎟️ Campion Challenge, 🎩 3 victorii, 🐳 gift de 100+ monede. Pe podium, tabelul din dreapta alternează între ziua, săptămâna, luna și toți timpii. Fișierul ține maxim 5000 de oameni (ies întâi cei fără victorii și fără puncte). Toate evenimentele din live se scriu în `logs/events-ZZZZ-LL-ZZ.jsonl`, ca să calibrăm cifrele după primul live.

## Comenzi din chat (pentru tine și moderatori)
În `config.json` poți adăuga `"moderators": ["user1", "user2"]`. Tu și ei puteți scrie în chat:
`!mode classic|challenge|teams|elimination` (în lobby se aplică imediat, în cursă de la runda următoare) · `!end` (termină cursa) · `!next` (sare podiumul) · `!pause` / `!resume` · `!lang en` · `!round 180` (durata jocului curent, în secunde; Eliminarea își calculează singură durata) · `!mute` / `!unmute`.
În fereastră: **P** = pauză, **M** = mute, **H** = panoul de simulare.

## Dacă pică conexiunea
Serverul reîncearcă la 5 s, apoi tot mai rar, până la 30 s. Pe ecran apare „Conexiunea cu TikTok a picat – reconectare…”, iar jocul continuă cu jucătorii existenți. Spune-le oamenilor că revine imediat; nu promite nimic ce nu se va număra.

## Calitate automată (performanță)
Fișierele `.bat` deschid jocul într-un profil Chrome separat, cu placa video dedicată și **fără încetinire când fereastra e acoperită** (altfel Chrome scade FPS-ul când LIVE Studio e deasupra). Verificare: în fereastra jocului deschide `chrome://gpu`; la „WebGL” trebuie să scrie „Hardware accelerated”. Dacă nu: Setări Chrome → Sistem → „Folosește accelerarea grafică” ON, iar în Windows → Setări → Afișaj → Grafică, pune Chrome pe „Performanță ridicată”.

Jocul își măsoară singur FPS-ul. Dacă scade sub 40, reduce pe rând: rezoluția, strălucirea (bloom), umbrele, apoi numărul de roboți desenați (24 → 18 → 12). Când revine peste 58 FPS, crește înapoi. În panou vezi FPS-ul și nivelul. Poți fixa nivelul cu `?quality=0` (maxim) până la `?quality=4` (minim).
Cu mulți spectatori, se desenează doar roboții din cadru; cei desenați rămân stabili (nu mai apar și dispar), iar prioritate au liderul, cei de pe podium, cel urmărit de cameră și cei care dau tap acum. Restul plutonului apare ca siluete (220, apoi 110 și 55 pe calculatoare slabe).

## Zi și noapte
Jocul ia ora de pe PC și schimbă singur cerul, lumina, stelele, felinarele și ferestrele blocurilor: 5–7 răsărit, 7–17 zi, 17–20 apus, 20–5 noapte, cu tranziție lină. Pentru test: `?time=13` (zi) sau `?time=23` (noapte).

## O singură fereastră de joc
Dacă deschizi o fereastră nouă de joc (alt JOC-*.bat), ea preia jocul, iar cea veche trece pe „Fereastră inactivă” (un click pe ea o reactivează). Așa nu mai rulează două jocuri deodată. Modurile le schimbi din panou, fără să deschizi alte ferestre.

## Link public (TUNEL.bat)
Cu START.bat pornit, dă dublu-click pe **TUNEL.bat**. Prima dată descarcă `cloudflared` (gratuit, fără cont), apoi îți arată un link `https://....trycloudflare.com`. Linkul apare și în panou, cu buton de copiere.
- **Linkul jocului** (`…/`): oricine îl deschide vede cursa în timp real, dar doar privește; nu poate trimite comenzi, gift-uri sau evenimente. Rulează o copie a jocului cu aceleași evenimente, deci clasamentul poate diferi puțin de al tău. Varianta exactă rămâne live-ul tău de pe TikTok.
- **Linkul panoului** (`…/panel.html`): pentru un moderator de încredere. Cere parola din `config.json` → `"panelPassword"`. Schimb-o când vrei și repornește START.bat.
- Linkul se schimbă la fiecare pornire. Închizi fereastra TUNEL ca să-l oprești.
- Dacă tunelul cade, fereastra TUNEL îl repornește singură. La tunelul rapid linkul nou apare în fereastră (și în panou), cu avertismentul că trebuie pus din nou în LIVE Studio.
- Tunelul rapid (`trycloudflare.com`) e dat de Cloudflare doar pentru teste: nu are garanție că rămâne pornit și duce maxim 200 de cereri deodată. Pentru live-uri serioase folosește linkul fix de mai jos și nu da linkul jocului la foarte mulți oameni deodată.

## Link fix pentru LIVE Studio (recomandat)
Cu un cont Cloudflare gratuit și un domeniu al tău (ex. `domeniul-tau.ro`, adăugat în Cloudflare), linkul nu se mai schimbă și îl pui în LIVE Studio **o singură dată**.
1. Cloudflare → **Networks → Tunnels → Create a tunnel** → tip **Cloudflared** → dă-i un nume.
2. Din comanda afișată copiezi doar **tokenul** (textul lung care începe cu `eyJ`). Nu trebuie să instalezi nimic: cloudflared e deja în `tools/`.
3. La **Public hostname**: subdomeniu `joc`, domeniul tău, **Service** = `HTTP` → `127.0.0.1:3000` (portul jocului).
4. În `config.json` adaugi:
   ```json
   "tunnelToken": "eyJ...",
   "tunnelHostname": "joc.domeniul-tau.ro"
   ```
   Pentru un live anume (`lives/clasic.json`) le pui în fișierul acelui live, cu un tunel separat și portul lui (3001…). Un token = o adresă = un singur joc.
5. Pornești START.bat și TUNEL.bat. Linkul pentru Studio (`https://joc.domeniul-tau.ro/?live=1&key=...`) rămâne același și după repornire.
- Cheia din link stă în `data/live-key.txt` (sau `data/<live>/live-key.txt`). Dacă linkul a ajuns la cine nu trebuie: șterge fișierul, repornește jocul și pune linkul nou în Studio.
- Tokenul e o parolă: nu da `config.json` nimănui.

## Runde scurte și instrucțiuni clare (pentru TikTok)
- **Rundele durează 2,5 minute** (Clasic, Challenge, Echipe), iar Eliminarea durează maximum ~3 minute. Podiumul stă 15 s. Pe TikTok lumea intră și iese repede.
- Gift-urile sunt recalibrate pentru rundele scurte: racheta pornește de la 4 m (`ROCKET_METERS_BASE`), iar energia din gift ține 1 s pe monedă. Echilibrul gift / tap e același ca la rundele de 5 minute; toate țintele din `tools/balanta.mjs` sunt ✓.
- **Banner mare „CUM SE JOACĂ”**, mereu vizibil sub bara cursei, în afara zonelor acoperite de TikTok. Arată două pastile mari și un rând mic, diferite pentru fiecare mod:
  - Clasic: `👆 TAP = ALERGI` · `🎁 GIFT = 🚀 RACHETĂ` · „Scrie orice în chat ca să intri”
  - Challenge: `🎁 5 🪙 = BILET` · `👆 TAP = ALERGI` · „Fără bilet? Scrie #nr și dă tap pentru el”
  - Echipe: `💬 SCRIE: roșu / albastru` · `👆 TAP = ALERGI` · „Gift = rachetă pentru echipa ta”
  - Eliminare: `👆 TAP = SCAPI` · `🎁 GIFT = 🚀 RACHETĂ` · „Eliminat? 10 🪙 = revii”
  - Există în toate cele 8 limbi ale jocului. Textul se micșorează singur ca să încapă întreg.

## Echilibru și corectitudine (verificat matematic)
- **Gift = rachetă + energie plină**: pe lângă metrii din rachetă, fiecare monedă ține energia plină 1 secundă (`GIFT_SECONDS_PER_COIN`). Un trandafir = 1 s, 30 de monede = 30 s, 150 = toată cursa de 2,5 minute. Așa, cine trimite gift-uri dar nu dă tap nu mai rămâne în urma celor care dau tap gratis.
- **Ținte respectate** (Clasic, 10 jucători; verificate și în jocul real): 500 de monede fără tap ajung la sosire și bat un jucător care dă tap 6/s; 1000 de monede bat tap 10/s; dar tap 10/s bate 30 de monede, iar tap 6/s bate 100 de monede, deci tap-ul contează. Fără tap și fără gift nu ajunge nimeni.
- **Aceleași șanse pentru toți**: împiedicările se decid cu aceeași formulă pentru jucătorii din cadru (liderii, gifterii) și pentru restul plutonului. Animația doar arată ce s-a decis.
- **Lobby**: tap-urile din lobby încarcă doar energia. Toți pleacă de la 0 m.
- **Challenge**: concurentul se alege cu `#3` sau cu un mesaj care e doar numărul (`3`). „e 3 dimineața” nu mai schimbă nimic.
- **Eliminare**: fiecare tăiere scoate cam minimum 25% din cei rămași (`MIN_CUT_SHARE`). Prima tăiere vine la 30 s, apoi câte una la 18 s: 10 jucători = 5 tăieri (132 s), maximum ~3 minute indiferent câți sunt.
- **Verificat statistic în motorul real** (2026-11-15): 1440 de jucători cu tap și gift-uri aleatorii. Regresia „distanța reală ~ distanța calculată din formule” dă pantă 1,000 ± 0,002, intercept 0 ± 3 m și R² = 0,999. Abaterea rămasă (±8 m) e doar norocul împiedicărilor și nu depinde de tap-uri, gift-uri, ordinea intrării sau echipă.
- **Șanse egale**: 1600 de runde cu jucători identici, în toate cele 4 moduri. Câștigurile nu depind de ordinea intrării (test χ², p > 0,05). La egalitate perfectă decide tragerea la sorți, iar la sosire contează momentul exact al trecerii liniei.
- Verifici oricând cu `node tools/balanta.mjs`: secțiunea **CORECTITUDINE** arată ✓ sau ✗ pentru fiecare țintă, dacă schimbi cifrele din `rules.js`.

## Dream Garage
- **Fizica mașinii e refăcută (2026-11-16).** Motorul are curbă de cuplu și cutie cu 5–6 trepte, tracțiunea ține cont de transferul de greutate, iar căldura depinde de sarcină și de viteza aerului. Reglajele (raport final, camber, boost) sunt alegeri reale: cel mai bun raport depinde de mașină. Detaliile și formulele sunt în `DREAM-GARAGE.md`.
- **Like-urile și gift-urile din duel sunt liniare.** 100 de like-uri într-un mesaj valorează exact cât 100 de like-uri separate, iar 30 de trandafiri cât un gift de 30 de monede. Înainte, 30 de trandafiri dădeau de 13 ori mai multă viteză decât un gift de 30 de monede.
- **Construcția nu se mai blochează** după ce o mașină e completă: echipa trece la următoarea mașină neterminată.
- **Grafică nouă la cursă:** șosea de noapte, felinare, oraș în fundal, linii de viteză, poartă de sosire, lumini care strălucesc. Ambele mașini rămân în cadru. Pe un calculator lent strălucirea se oprește singură (`?fx=0` o oprește, `?fx=1` o ține pornită).
- Verificare: `npm run test:garage` (40 de teste, inclusiv conservarea energiei și „niciun upgrade nu încetinește mașina”).
- **Body kit-ul (aero)** dă acum apăsare aerodinamică reală: mai multă aderență, cu cât mașina merge mai repede. Înainte doar adăuga greutate și rezistență la aer, deci mașina devenea mai lentă (până la +0,09 s pe 400 m), deși promitea „stabilitate”. Verificat: **niciun upgrade, la niciun nivel, pe nicio mașină, nu mai face mașina mai lentă.**
- **Voturile pentru stil**: la egalitate rămâne stilul curent, în loc să câștige automat STREET. Cine a votat deja își poate schimba votul și după 3000 de votanți.
- **Follow**: creditele se dau o singură dată pe persoană într-un live. Cu unfollow și follow repetat nu se mai pot strânge credite la nesfârșit.

## Siguranță și stabilitate (ce face serverul singur)
- **Setările din panou nu mai „îngheață” regulile.** Înainte, orice modificare din panou (chiar și volumul) salva în browser toate valorile, inclusiv durata rundelor, iar valorile noi din `rules.js` nu mai ajungeau în joc. Acum se salvează doar ce ai schimbat tu. Salvările vechi se curăță singure la prima pornire.
- **Date stricate nu mai pot bloca jocul.** Orice eveniment e curățat la intrare (numere finite și limitate, texte reale). Testat cu zeci de mii de evenimente aleatorii și greșite în toate cele 4 moduri.
- **Rezultatul rundei nu se pierde** dacă serverul e repornit chiar la finalul ei: jocul îl trimite la reconectare. Serverul acceptă rezultate doar de la fereastra de joc activă.
- **Clasamentele nu se pierd**: se scriu sigur (întâi într-un fișier temporar), iar varianta anterioară rămâne în `stats.json.bak`. Dacă `stats.json` e stricat (ex. pană de curent), se reface automat din `.bak`, iar fișierul stricat se păstrează alături.
- **Reconectare TikTok fără dubluri**: după o cădere rămâne o singură conexiune, iar același gift primit de două ori se numără o singură dată.
- **O eroare neașteptată nu oprește live-ul**: se notează în `logs/server-errors.log`, iar serverul merge mai departe. Trimite-mi fișierul dacă apare ceva acolo.
- **Ctrl+C sau închiderea ferestrei** salvează clasamentele înainte de oprire.
- **Spectatori prin tunel**: maxim 100 deodată (`"maxViewers"` în config.json). Cei cu internet slab sau conexiune moartă sunt deconectați automat, ca să nu încetinească jocul.
- **Doar jocul și panoul tău** (paginile de pe acest calculator) pot trimite comenzi fără parolă. Un site străin deschis în Chrome nu poate controla jocul.

## Bine de știut
- Conexiunea la LIVE folosește librăria neoficială `tiktok-live-connector`. Dacă TikTok schimbă ceva, poate să nu mai meargă până la un update: rulează `npm update tiktok-live-connector`.
- Dacă conexiunea e refuzată des, poți face o cheie gratuită pe eulerstream.com și s-o pui la `signApiKey`.
- Premiile rămân în joc (podium, coroană, campioni). Nu promite premii în bani pentru gift-uri, pentru că încalcă regulile TikTok.
