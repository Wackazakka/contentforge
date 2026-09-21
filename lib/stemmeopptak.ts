// Opptaksløypa for en proffklone (PVC).
//
// 🔑 REGISTRENE ER DE SAMME ORDENE SOM REGIEN I AUDITION. Det er det viktigste
// valget i fila. Ber en regissør om «dramatisk» i Audition, skal modellen ha
// hørt nettopp dramatisk under opptaket. Hadde vi funnet på et eget vokabular
// her — «intens», «lav», «myk» — ville regissøren bedt om noe klonen aldri var
// trent på, og ingen ville forstått hvorfor det ikke låt riktig. Se REGI i
// lib/auditions.ts; hvisking er det eneste tillegget, fordi den er akustisk
// særegen og v3-taggene kan be om den.
//
// 🔑 VARIERT LEVERING, KONSISTENTE FORHOLD. ElevenLabs' egen veiledning ble
// først lest som «hold stilen konsistent», altså flat opplesning. Det er feil
// lesning: konsistensen gjelder MIKROFON, rom og nivå. Leveringen skal
// variere — «modellen arver den naturlige prosodien din; er fremføringen
// flat, blir modellen det også». En klone trent på to timer nøytral kan bare
// nøytral, uansett hvilken tagg man sender inn etterpå.
//
// 🔑 30 MINUTTER ER ET EKTE MÅL (Lars 21.09, av erfaring). Dokumentasjonen
// anbefaler 2–3 timer, men Lars har gjort dette før og får gode resultater på
// 30. Løypa er derfor bygget rundt 30 som et FULLFØRT løp, ikke som et
// minimum man unnskylder — med lengre løp som en anbefaling, ikke et krav.
// Et mål ingen orker å nå, gir null opptak.

export type Register =
  | 'noytral' | 'varm' | 'entusiastisk' | 'rolig' | 'trist' | 'dramatisk' | 'hvisking'

export interface RegisterSpec {
  /** Hva hun får se over teksten. Instruks, ikke beskrivelse. */
  instruks: string
  /** Sekunder som skal til før registeret regnes som dekket. */
  maalSek: number
}

/**
 * Fordelingen over 30 minutter.
 *
 * Nøytral dominerer fordi den er grunnstammen — det klonen sier mest av. De
 * øvrige trenger nok til å bli hørt, ikke like mye. Summen er 1800 sekunder.
 */
export const REGISTRE: Record<Register, RegisterSpec> = {
  noytral:      { instruks: 'Les rolig og jevnt, som om du forklarer noe for en du kjenner godt.', maalSek: 600 },
  varm:         { instruks: 'Les varmt og nært, som om den du snakker til sitter rett ved siden av deg.', maalSek: 240 },
  entusiastisk: { instruks: 'Les med driv og glede. Du har lyst til at den andre skal høre dette.', maalSek: 240 },
  rolig:        { instruks: 'Les langsomt og lavt. Ingenting haster.', maalSek: 180 },
  trist:        { instruks: 'Les tungt og dempet. La pausene være der de hører hjemme.', maalSek: 180 },
  dramatisk:    { instruks: 'Les med kraft og innsats — hev stemmen der teksten ber om det.', maalSek: 180 },
  hvisking:     { instruks: 'Hvisk. Ikke lavmælt tale — ekte hvisking, tett på mikrofonen.', maalSek: 180 },
}

export const MAAL_SEK = Object.values(REGISTRE).reduce((s, r) => s + r.maalSek, 0)

/**
 * Tekstene.
 *
 * ⚠️ ALT ER SKREVET FOR FORMÅLET. Ingen utdrag fra bøker, sanger eller
 * artikler — et opptaksverktøy som ber folk lese opphavsrettsbeskyttet
 * materiale inn i en modell vi selger, lager et problem vi ikke trenger.
 *
 * Hver passasje er ~120–180 ord, altså omtrent ett minutt høyt lest. Innholdet
 * BÆRER registeret: man hvisker ikke troverdig en tekst som roper. Uten det må
 * skuespilleren spille mot teksten, og da blir leveringen påtatt — og det er
 * påtattheten modellen lærer.
 */
export const TEKSTER: Record<Register, string[]> = {
  noytral: [
    'Det er noe med morgenene i november som gjør at alt ser tydeligere ut. Lyset kommer sent og lavt, og det legger seg på husveggene på en måte det ikke gjør ellers i året. Folk går fortere. Bussene er fullere. På kaia ligger båtene stille, og måkene har flyttet seg innover mot byen der det er varmere og lettere å finne mat. Jeg pleier å gå den lange veien til jobb i denne perioden, forbi det gamle verkstedet og ned mot vannet, fordi det er den eneste tiden på døgnet da det er stille nok til å tenke. Det tar elleve minutter ekstra. Jeg har regnet på det.',
    'En vanlig lyspære bruker omtrent seksti watt. En moderne LED-pære gir like mye lys på under ti. Forskjellen ligger ikke i lyset, men i varmen: den gamle pæra brukte mesteparten av strømmen på å bli varm, og bare en liten del på å lyse. Det er derfor de gamle pærene var ubehagelige å skru ut rett etter at de hadde stått på. I et hjem med tjue lyspunkter utgjør forskjellen flere hundre kroner i året, og over ti år blir det en sum de fleste ville lagt merke til om den kom som en regning i posten i stedet for å forsvinne litt etter litt.',
    'Han hadde jobbet i samme bygg i tjueto år da de bestemte seg for å rive det. Det var ikke noe galt med bygget. Det sto der det hadde stått, med de samme vinduene og den samme trappa, og de samme flekkene i linoleumen utenfor kantina. Men tomta var verdt mer enn bygget, og slik regnestykker fungerer, betyr det at bygget må vekk. Han fikk med seg en stol da de tømte kontorene. Den står på hytta nå, litt for lav til bordet, og han har aldri byttet den ut.',
    'Oppskriften krever fire egg, men tre holder hvis de er store. Rør plommene med sukkeret til blandingen er lys og tykk. Det tar lengre tid enn du tror, og det er det eneste steget der det ikke lønner seg å skynde seg. Smelt smøret forsiktig, og la det kjøle seg litt før du har det i, ellers stivner ikke røra som den skal. Hvetemelet vendes inn til slutt, med en slikkepott og så få tak som mulig. Stekes midt i ovnen på hundreogåtti grader i tjuefem minutter. Kaka er ferdig når en tannpirker kommer tørr ut av midten.',
    'Det norske jernbanenettet er omtrent fire tusen kilometer langt, og av dette er under halvparten elektrifisert. Mye av strekningene ble bygget i en tid da terrenget bestemte traseen fullstendig, og det gjør at togene i dag kjører i svinger som ingen ville tegnet nå. Å rette ut en kurve høres enkelt ut, men i praksis betyr det tunnel, bru eller ny grunnerverv gjennom områder som har vært i bruk i hundre år. Derfor går utbedringene sakte, og derfor koster de mer enn folk forventer når de leser tallene i avisa.',
    'Vi møttes på et venteværelse, begge to med feil time. Hun hadde kommet en dag for tidlig, jeg en time for sent, og resepsjonisten hadde sagt det samme til oss begge: at vi kunne sette oss, så skulle de se hva de fikk til. Vi satt der i førti minutter. Hun leste ferdig et blad fra i fjor. Jeg later som jeg gjorde det samme, men jeg husker ikke en eneste side. Da de endelig ropte opp navnet mitt, spurte hun om jeg kom tilbake neste uke. Det gjorde jeg.',
    'Kontrakten er på fjorten sider, og de tre første handler om hvem partene er. Det er standard, og det er også der de fleste slutter å lese. Det som betyr noe står på side ni, i avsnittet om varighet og oppsigelse, og i vedlegget bakerst der satsene er listet opp. Les de to stedene først, og gå tilbake til begynnelsen etterpå. Er det noe du ikke forstår, er det som regel ikke fordi du mangler forutsetninger, men fordi setningen er skrevet for å tåle en rettssak og ikke for å bli lest.',
    'Biblioteket flyttet inn i det gamle posthuset i fjor vår. Det var mye motstand i forkant, og mesteparten handlet om parkering. Nå er det knapt noen som nevner det. Lokalet har takhøyde og store vinduer mot sør, og skrankene fra den gangen folk hentet pakker der står fortsatt langs veggen, pusset opp og brukt til utstillinger. Det sitter folk der hele dagen. Studenter om formiddagen, pensjonister rundt lunsj, og etter tre kommer ungdomsskolen og legger beslag på hele andre etasje. Utlånet har økt med en tredjedel. Ingen hadde regnet med at det var rommet som var problemet.',
    'Et vanlig hjerte slår omtrent hundre tusen ganger i løpet av et døgn. Over et helt liv blir det rundt tre milliarder slag. Muskelen som gjør dette er på størrelse med en knyttneve, og den hviler aldri lenger enn brøkdelen av et sekund mellom hvert sammentrekk. Den henter energien sin fra egne blodårer som ligger utenpå, og det er når disse tetter seg at problemene oppstår — ikke fordi muskelen er sliten, men fordi den ikke får noe å arbeide med. Det er den enkle forklaringen på noe som ellers virker urimelig: at et organ som har klart seg i seksti år, kan svikte i løpet av minutter.',
    'Vi hadde tre uker på oss og en liste på førtito punkter. Det første vi gjorde var å stryke tjue av dem. Ikke fordi de var uviktige, men fordi vi visste at vi ikke kom til å rekke dem, og at halvferdige punkter er verre enn punkter vi aldri begynte på. De som ble igjen, sorterte vi etter hva som ville stoppe alt annet hvis det ikke ble gjort. Det ga en rekkefølge nesten ingen var enige i, og som viste seg å være riktig. Vi ble ferdige med to dager til overs.',
    'Snøen kom sent det året. Den første ordentlige natta var tjueandre desember, og da kom det femti centimeter på tolv timer. Brøytebilene rakk ikke rundt. Folk gikk i veibanen fordi fortauene ikke fantes lenger, og butikkene hadde åpent til ni uten at noen kom. Så, andre juledag, snudde vinden, og på tre dager var alt borte igjen. Det eneste som ble igjen var hauger på parkeringsplassene, grå og harde, som lå der til langt ut i februar.',
    'Renter oppgis alltid per år, også når lånet ditt skal nedbetales over tjuefem. Det gjør at tallet ser lite ut, og det er en del av grunnen til at folk undervurderer hva de faktisk betaler. På et lån på tre millioner utgjør ett prosentpoeng tretti tusen kroner i året før skatt. Over løpetiden, hvis renten holder seg, blir det et beløp som overstiger prisen på en bil. Det betyr ikke at man skal la være å låne. Det betyr at forskjellen mellom to tilbud som ser like ut, sjelden er liten.',
    'Han lærte meg å sløye fisk den sommeren jeg var ni. Det var ikke noe han satte av tid til, det bare skjedde, fordi jeg sto der og fulgte med og på et tidspunkt rakte han meg kniven. Første gangen gjorde jeg det feil og ødela mesteparten. Han sa ingenting om det. Vi tok neste fisk, og han holdt hånda mi rundt skaftet og viste vinkelen, og så slapp han. Jeg gjorde det feil den gangen også, men mindre feil. På den femte satt det.',
    'Ordet kom inn i språket på 1600-tallet og betydde opprinnelig noe helt annet enn i dag. Det er ikke uvanlig. Språk flytter seg raskest der det brukes mest, og et ord som er i daglig bruk i fire hundre år, ender nesten alltid et annet sted enn der det begynte. Det som er verdt å merke seg er at ingen bestemte det. Det finnes ikke noe møte der noen vedtok den nye betydningen. Den oppsto fordi nok folk brukte ordet litt feil, lenge nok, til at feilen ble riktig.',
    'Rommet var åtte ganger fire meter, med vinduer bare i den ene enden. Vi delte det tre stykker, og vi hadde hvert vårt bord langs veggene, slik at ingen satt vendt mot noen. Det var ikke planlagt, det ble bare sånn den første dagen, og så flyttet ingen på seg igjen. Vi jobbet der i halvannet år. Jeg husker knapt noen samtaler, men jeg husker lyden av de to andres tastaturer, og hvordan jeg kunne høre på rytmen hvem som holdt på med hva.',
  ],
  varm: [
    'Du kom hjem midt på dagen, og jeg hørte det på måten døra gikk igjen på. Ikke det harde smellet når du har glemt noe og skal ut igjen med en gang, men det rolige. Jeg satt fortsatt ved kjøkkenbordet med den kalde kaffen, og du sa ingenting, du bare satte deg ned på den andre siden og ble sittende. Vi snakket ikke om noe særlig. Det var ikke nødvendig. Sola flyttet seg over bordplata mens vi satt der, og på et tidspunkt strakte du deg over og tok koppen min og helte den ut, og lagde ny.',
    'Hun var fire år og hadde bestemt seg for at hun skulle bære sekken selv hele veien. Den var altfor stor, og den slo mot leggene hennes for hvert steg, og jeg gikk bak og lot være å si noe. Halvveis oppe i bakken stoppet hun, snudde seg, og spurte om jeg trodde hun klarte det. Jeg sa at det trodde jeg. Hun snudde seg tilbake og gikk videre. Da vi kom fram, hadde hun ikke sagt et ord på ti minutter, og hun slapp sekken i gresset og la seg ned ved siden av den og lo.',
    'Takk for at du kom. Jeg vet at det er langt, og jeg vet at du hadde nok å gjøre denne uka. Det betyr mer enn jeg klarer å si akkurat nå, så jeg sier det heller enkelt: det var godt å se deg i døra. Vi rekker en kopp før du må videre, og hvis du vil ta med deg noe hjem, står det en boks på benken som jeg har pakket ferdig. Ikke protester. Du gjorde det samme for meg i vinter, og da sa jeg ikke imot heller.',
    'Da jeg kom hjem, hadde du satt fram tallerkener til to, og du hadde funnet fram de gode glassene som vi egentlig bare bruker i jula. Det var en helt vanlig onsdag. Jeg spurte hva vi feiret, og du sa at det var ingenting spesielt, du hadde bare hatt lyst. Vi ble sittende lenge. Utenfor begynte det å regne, og vi hørte det mot vinduet uten å snakke om det, og på et tidspunkt strakte du deg bort og tok hånda mi, og lot den ligge der mens vi spiste ferdig med den andre.',
    'Han var åttifire år gammel og satt i den samme stolen hver eneste ettermiddag, ved vinduet mot gata, med teppet over knærne. Når jeg kom, ville han alltid høre om ungene først. Aldri om meg. Hvordan går det med den yngste, sa han, er hun fortsatt like sta? Og så fortalte jeg, og han lo lavt og nikket og sa at det hadde hun etter meg. Jeg tror ikke det var sant. Men han sa det hver gang, og hver gang lot jeg være å si imot.',
    'Du trenger ikke å forklare noe. Jeg vet at du har hatt en tung uke, og jeg vet omtrent hvorfor, og resten kan du fortelle hvis du får lyst. Eller la være. Det er varmt i kjelen, og det er plass på sofaen, og det er ingenting på lista i kveld som ikke kan vente til i morgen. Ta av deg jakka. Sett deg ned. Vi trenger ikke å gjøre noe mer enn det akkurat nå.',
  ],
  entusiastisk: [
    'Og det er akkurat det som er det fine med den: du trenger ikke kunne noe fra før! Du slår den på, den finner nettverket selv, og så er du i gang. Ingen kabler, ingen oppsett, ingen brukermanual på fire språk du uansett ikke gidder å lese. Jeg fikk min på tirsdag og hadde den oppe og gå før kaffen var ferdig. Og når du først har fått den i gang, oppdager du at den gjør ting du ikke visste at du hadde bruk for — og så er det de tingene du bruker den til mest.',
    'De ledet med to mål med et kvarter igjen, og så begynte det. Først en corner som ingen fikk hodet på, og så det skuddet fra tjue meter som gikk via stolpen og inn. Publikum reiste seg. Fire minutter senere sto det likt. Og i det nittitredje minuttet, da alle hadde begynt å gå mot utgangen, kom ballen ut til han på kanten som hadde vært inne i syv minutter til sammen hele sesongen. Han traff den perfekt. Jeg har sett den ti ganger siden, og den er like god hver gang.',
    'Kom og se på dette! Nei, virkelig, kom hit. Se på fargen. Jeg har prøvd å få til akkurat den fargen i to år, og jeg har gjort nøyaktig det samme hver gang, og i dag skjedde det. Jeg vet ikke hva som var annerledes. Kanskje temperaturen, kanskje leira, kanskje bare flaks. Men den er der. Og hvis jeg klarer å finne ut hva jeg gjorde, så kan jeg gjøre det igjen, og da har jeg noe helt eget.',
    'Dette er det beste jeg har smakt i hele år, og jeg mener det! Kjenn på konsistensen — det er akkurat sånn det skal være. Jeg har prøvd å få til dette hjemme fire ganger, og hver gang har det blitt for tørt, og så kommer du hit og gjør det på første forsøk. Du må fortelle meg hvordan. Nei, nå, mens jeg husker det. Og så lager vi det igjen på lørdag, og da inviterer vi de andre, for dette må flere få smake.',
    'Vi klarte det! Etter fjorten måneder, og etter at alle vi snakket med sa at det ikke gikk an, så står det der og virker. Jeg fikk beskjeden klokka sju i morges og jeg har ikke fått gjort noe fornuftig siden. Det første jeg tenkte var på alle kveldene i fjor høst da ingenting stemte og vi begynte å lure på om vi holdt på med noe som helst. Vi gjorde visst det. Vi gjorde visst akkurat det.',
    'Bare se hva som skjer når du drar i denne. Ser du? Hele konstruksjonen folder seg ut på under to sekunder, og så står den. Ingen verktøy, ingen skruer, ingenting som kan bli borte i grusen. Og når du skal pakke den sammen igjen, gjør du nøyaktig det motsatte. Jeg har hatt den med på fire turer nå, i regn og i vind, og den har ikke sviktet en eneste gang. Det er rett og slett godt håndverk.',
  ],
  rolig: [
    'Pust inn gjennom nesa. Hold det et øyeblikk. Slipp ut gjennom munnen, langsomt, og la skuldrene falle mens du gjør det. Det er ingenting du skal få til nå. Det er ingenting som må være ferdig. Kjenn etter hvor kroppen har kontakt med underlaget, og la den vekten være der den er. Hvis tankene går et annet sted, er det helt i orden. Legg merke til hvor de gikk, og kom tilbake hit. Pust inn igjen. Litt dypere denne gangen.',
    'Vannet står helt stille før soloppgang. Det er den eneste timen i døgnet da det er slik, og den varer ikke lenge. Er du ute på en morgen i august, ser du hele åsen speilet i overflaten, opp ned og uten en eneste krusning. Så kommer den første vinden nedover dalen, og bildet forsvinner på et par sekunder. Du kan ro forsiktig og holde det litt lenger der du er, men bare litt. Det er noe av det som gjør det verdt å stå opp så tidlig: at det ikke går an å holde på det.',
    'La blikket hvile på et punkt et stykke unna. Ikke fest det — bare la det ligge der. Kjenn hvordan pusten går av seg selv, uten at du gjør noe med den. Det er ingen riktig måte å gjøre dette på. Hvis du blir urolig, er det også greit; legg merke til uroen, og la den være der uten å gjøre noe med den heller. Ingenting av dette skal føre til noe. Det er bare noen minutter hvor du ikke skal noe sted.',
    'Skogen er annerledes om høsten. Ikke bare fargene — lyden. Løvet demper alt, og fottrinnene forsvinner i bakken i stedet for å gi gjenlyd slik de gjør på frossen mark. Går du langsomt nok, hører du bare din egen pust. Det tar omtrent tjue minutter før hodet slutter å snakke. Jeg vet ikke hvorfor det er akkurat tjue, men det er det hver gang, og etter det går resten av turen av seg selv.',
    'Legg fra deg det du holder i. Sett deg godt til rette, og la hendene ligge der de faller naturlig. Vi har god tid. Det er ingen som venter på oss, og det er ingenting på lista som ikke tåler å vente en halvtime til. Kjenn etter om det er noe som spenner — kjeven, skuldrene, hendene — og la det løsne i sitt eget tempo. Ikke press. Det kommer når det kommer.',
  ],
  trist: [
    'Vi ryddet leiligheten hennes over to helger. Det meste var lett. Kjøkkenskapene, klærne, papirene i den grønne mappa hun hadde merket så tydelig at ingen trengte å lure. Det var den øverste skuffen på soverommet som stoppet oss. Der lå brillene, og et armbåndsur som hadde stanset, og en liste over navn med telefonnummer skrevet ved siden av, alle sammen med hennes håndskrift. Halvparten av dem var folk jeg aldri hadde hørt om. Vi satte oss på gulvet, min bror og jeg, og ble sittende en stund uten å si noe.',
    'Jeg gikk forbi huset i forrige uke. Det er malt en annen farge nå, og de har tatt ned hekken mot veien, så man ser rett inn på plenen der vi hadde trampolinen. Den er borte, selvfølgelig. Det står en bil der i stedet. Jeg ble stående litt for lenge på fortauet, lenge nok til at en kvinne i vinduet så på meg, og da gikk jeg videre. Jeg vet ikke hva jeg hadde tenkt at jeg skulle se.',
    'Det er stolen som er verst. Ikke bildene, ikke klærne, ikke noe av det vi var forberedt på. Stolen står der den alltid har stått, vendt mot vinduet, med den samme puta i ryggen og avisa fra den uka liggende på bordet ved siden av. Vi har ikke klart å flytte den. Vi går rundt den når vi rydder, og ingen har sagt noe om det, og jeg tror ikke noen kommer til å si noe heller.',
    'Vi snakket sammen på telefonen tirsdag kveld. Det var ingenting spesielt — hun spurte om helga, og jeg sa at jeg skulle prøve å komme innom, og hun sa at det var helt greit hvis det ble travelt. Jeg sa at jeg skulle ringe onsdag. Det gjorde jeg ikke. Jeg hadde tenkt å gjøre det torsdag i stedet, og så kom torsdagen, og da var det for sent. Det er det jeg tenker på nå. Ikke det store. Bare den samtalen jeg ikke tok.',
    'Brevet lå i den samme skuffen i elleve år. Jeg visste at det lå der. Hver gang jeg åpnet skuffen for å finne noe annet, så jeg det, og hver gang lukket jeg den igjen. I fjor tok jeg det fram og satte meg ned for å lese det, og da oppdaget jeg at jeg allerede visste hva som sto der. Jeg hadde bare ikke villet vite at jeg visste det.',
  ],
  dramatisk: [
    'Nei! Ikke gå inn dit — hører du hva jeg sier? Bli stående! Det er ikke trygt, det har ikke vært trygt på flere timer, og hvis du går gjennom den døra nå, så kommer jeg ikke etter deg. Se på meg. Se på meg! Vi går tilbake samme vei som vi kom, og vi gjør det nå, før det blir mørkt og vi ikke finner veien i det hele tatt. Jeg bryr meg ikke om hva du lovte dem. Du lovte meg noe først.',
    'Hvor var du? Jeg ringte deg elleve ganger. Elleve! Jeg sto utenfor i regnet i halvannen time og trodde at det hadde skjedd noe, at du lå et sted, at noen måtte lete. Og så kommer du gående som om ingenting har hendt og spør hvorfor jeg er opprørt. Du skjønner det ikke, gjør du vel? Du skjønner virkelig ikke hva du gjorde mot meg i kveld.',
    'Du løy for meg! Stå der og se meg i øynene og si at du ikke gjorde det — nei, du klarer det ikke, gjør du vel? Jeg forsvarte deg. Jeg sto i det rommet og sa at det ikke fantes en sjanse, at jeg kjente deg, at de tok feil. Og hele tiden visste du. Hvor lenge? Hvor lenge har du sittet ved det bordet og sett på at jeg gjorde meg til narr for din skyld?',
    'Få dem ut! Nå! Alle sammen ut, gjennom bakdøra, og ikke stopp for å hente noe — det er ingenting der inne som er verdt det. Hører du? Ingenting! Du tar de to som er nærmest deg og går, og jeg kommer etter når jeg vet at resten er ute. Ikke diskuter med meg. Vi har kanskje to minutter, og du kaster bort ti sekunder av dem akkurat nå.',
    'Jeg ba deg om én ting. Én eneste. Alt det andre kunne du gjøre som du ville, og det har du gjort, hver gang, uten å spørre. Men den ene tingen ba jeg deg om, og du så på meg og sa ja. Og så gjorde du det likevel. Så nå skal du høre på meg, og du skal høre til jeg er ferdig, for dette er siste gangen jeg sier det.',
  ],
  hvisking: [
    'Ikke si noe. Hør etter. Det er noen i gangen — nei, ikke snu deg, bare hør. Det har vært der i et par minutter nå. Hvis vi er helt stille, går det kanskje over. Vi blir sittende her til det blir lyst, og så går vi ut sammen, og så sier vi ingenting om dette til noen. Er du med? Bra. Pust rolig. Det går fint.',
    'Jeg har tenkt på om jeg skulle si dette høyt eller ikke. Det er ikke noe jeg har fortalt til noen andre, og når jeg først sier det, så kan jeg ikke ta det tilbake. Men du skal få vite det, og du skal få vite det fra meg. Ikke se sånn på meg. Bare hør til jeg er ferdig, så kan du si hva du vil etterpå.',
    'Kom nærmere. Jeg orker ikke å snakke høyere enn dette. Det er noe jeg skulle ha sagt for lenge siden, og nå er det sent, og jeg vet ikke om det hjelper noe å si det nå heller. Men jeg vil at du skal vite det. Du var den eneste som ble. Alle de andre gikk, og det forstår jeg godt, og jeg har aldri klandret dem for det. Men du ble.',
    'Hysj. Hører du det? Der igjen. Det kommer nedenfra, fra kjelleren, og det har holdt på i et kvarter. Jeg har låst døra og satt stolen under håndtaket, men jeg vet ikke om det hjelper. Vi blir her. Vi sier ingenting, vi rører oss ikke, og hvis det slutter, venter vi ti minutter til før vi går ut. Ti minutter. Ikke ett sekund mindre.',
    'Jeg skal fortelle deg noe, og du må love meg at du ikke sier det videre. Ikke til noen. Ikke engang til henne — særlig ikke til henne. Det er ikke farlig, det er bare mitt, og jeg har båret på det alene siden i vår. Sett deg ned. Sånn ja. Og lov meg det først, før jeg begynner.',
  ],
}

export interface Dekning { register: Register; sek: number }

/** Hvor langt er hun? Ren funksjon — hele fremdriftsvisningen hviler på den. */
export function fremdrift(dekning: Dekning[]) {
  const per = Object.entries(REGISTRE).map(([k, spec]) => {
    const r = k as Register
    const sek = dekning.find((d) => d.register === r)?.sek ?? 0
    return { register: r, sek, maalSek: spec.maalSek, dekket: sek >= spec.maalSek }
  })
  const totaltSek = per.reduce((s, p) => s + p.sek, 0)
  return {
    per,
    totaltSek,
    maalSek: MAAL_SEK,
    // 🔑 «Ferdig» krever at HVERT register er dekket, ikke bare at summen er
    // 30 minutter. Uten det kan hun lese nøytralt i en halvtime og tro hun er
    // i mål — og da får klonen ingen rekkevidde, som var hele poenget.
    ferdig: per.every((p) => p.dekket),
    // Neste register å ta: det som mangler mest, så hun ikke selv må styre
    // fordelingen.
    nesteRegister: per.filter((p) => !p.dekket).sort((a, b) => (a.sek / a.maalSek) - (b.sek / b.maalSek))[0]?.register ?? null,
  }
}

/** Velg en tekst hun ikke har lest ennå i dette registeret. */
export function nesteTekst(register: Register, leste: number[]): { indeks: number; tekst: string } | null {
  const alle = TEKSTER[register]
  const ledig = alle.map((_, i) => i).filter((i) => !leste.includes(i))
  // Er alle lest, gjentas den minst brukte framfor å stoppe. Gjentakelse er
  // ikke ideelt, men et opptak som stopper fordi tekstbanken er tom, er verre.
  const i = ledig.length > 0 ? ledig[0] : 0
  return alle[i] ? { indeks: i, tekst: alle[i] } : null
}
