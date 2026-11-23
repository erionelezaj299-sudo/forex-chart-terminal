// [label, setting, type, min, max, step]
export const GROUPS = [
  ['Market structure', [
    ['Swing sensitivity','sensitivity','number',2,50,1], ['Strong close threshold %','closeThreshold','number',10,100,1],
    ['Market bias','bias','choice',['Both','Bull','Bear']], ['Filter small swings','filterSmallSwings','checkbox'],
    ['Minimum swing × ATR','minSwingAtr','number',0.1,5,0.05], ['Show HH / HL / LH / LL','showStructure','checkbox'],
    ['Show BOS','showBos','checkbox'], ['BOS color','bosColor','color'], ['BOS width','bosWidth','number',1,5,1],
  ]],
  ['Fibonacci', [
    ['Show Fibonacci','showFib','checkbox'], ['Show 0 level','showFib0','checkbox'], ['Show 1 level','showFib1','checkbox'],
    ['Show level labels','showFibPrice','checkbox'], ['Main ratio','fibRatio','number',0,1,0.001],
    ['Extension bars','fibExtension','number',5,50,1], ['Line color','fibColor','color'], ['Main ratio color','fibMainColor','color'],
    ['Line width','fibWidth','number',1,10,1], ['Enable ratio 2','fib2Enabled','checkbox'], ['Ratio 2','fib2','number',0,1,0.001],
    ['Enable ratio 3','fib3Enabled','checkbox'], ['Ratio 3','fib3','number',0,1,0.001],
    ['Enable ratio 4','fib4Enabled','checkbox'], ['Ratio 4','fib4','number',0,1,0.001],
    ['Enable ratio 5','fib5Enabled','checkbox'], ['Ratio 5','fib5','number',0,1,0.001],
    ['Ratio 2 color','fib2Color','color'], ['Ratio 3 color','fib3Color','color'],
    ['Ratio 4 color','fib4Color','color'], ['Ratio 5 color','fib5Color','color'],
    ['Show standard 0.618','showFib618','checkbox'], ['Show standard 0.236','showFib236','checkbox'],
  ]],
  ['Premium / discount', [
    ['Enable premium / discount','premiumEnabled','checkbox'], ['Use 1m price when available','use1mPrice','checkbox'],
    ['4H sensitivity','sensitivity4h','number',2,50,1],
    ['1D sensitivity','sensitivity1d','number',2,50,1],
  ]],
  ['Volume profile', [
    ['Show profile','showVp','checkbox'], ['Rows','vpRows','number',8,150,1], ['Use 1m intrabar volume','vpUseLtf','checkbox'],
    ['End at fib extreme','vpEndAtExtreme','checkbox'], ['Width in bars','vpWidth','number',4,80,1],
    ['Right offset in bars','vpOffset','number',0,30,1], ['Profile color','vpColor','color'], ['POC row color','vpPocColor','color'],
    ['Show POC','vpPoc','checkbox'], ['POC line color','vpPocLineColor','color'], ['POC width','vpPocLineWidth','number',1,4,1],
    ['POC line style','vpPocLineStyle','choice',['solid','dashed','dotted']],
  ]],
  ['Fair value gaps', [
    ['Show gaps','showFvg','checkbox'], ['Only active fib leg','fvgActiveLeg','checkbox'], ['Only near main fib','fvgNearFib','checkbox'],
    ['Fib tolerance %','fvgTolerance','number',0,100,1], ['Extension bars','fvgExtension','number',0,500,1],
    ['Fill color','fvgColor','color'], ['Border color','fvgBorder','color'],
  ]],
  ['Liquidity and fractals', [
    ['Show liquidity sweep','showLiquidity','checkbox'], ['Liquidity sensitivity','liquiditySensitivity','number',2,20,1],
    ['Show fractals','showFractals','checkbox'], ['Bill Williams filter','filterBW','checkbox'], ['Major swings only','majorOnly','checkbox'],
    ['Major threshold × ATR','majorThreshold','number',0.5,5,0.1], ['Major lookback','majorLookback','number',3,30,1],
  ]],
];
