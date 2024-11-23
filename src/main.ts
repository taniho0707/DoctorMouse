import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from "@tauri-apps/api/event";
import { writeTextFile } from '@tauri-apps/plugin-fs';

import { SerialPort, PortInfo } from "tauri-plugin-serialplugin";
import { open, save } from '@tauri-apps/plugin-dialog';

import * as Plotly from 'plotly.js-dist-min';

/////////////////////
// Global Variable //
/////////////////////
let uartPorts: {[key: string]: PortInfo;} = {};
let currentData: string = '';

// 現時点では [time,motorL,motorR,motorCurrentL,motorCurrentR,motorS,encL,encR,wallFL,wallL,wallC,wallR,wallFR,distC,distF,angF,kabekireL,kabekireR,targetVT,targetVR,currentVT,currentVR,posX,posY,posT,gyroY,accX,accY,accZ,battery]
let header: string[] = [];
// [0] 12201000, 12202000, 12203000,
// [1]    0.000,    0.001,    0.002,
// [2]   -0.000,   -0.001,   -0.002,
let data: string[][] = [];

/////////////////////
// Parse Functions //
/////////////////////
const parseStringData = (txt: string) => {
  const lines = txt.split('\n');

  // TODO: /^time,/ or /[DEBUG]\n$/ or /\+(---\+){32} を満たす行を探す
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('time,')) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex == -1) {
    console.log('This file does not contain header line.');
    return;
  }

  header = lines[headerIndex].split(',');
  let unordered_data = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].split(',');
    if (line.length === header.length) {
      unordered_data.push(line);
    } else {
      console.log(`Line ${i} is invalid.`);
    }
  }

  // header[0] == 'time' の場合、time を [us] から [ms] に変換し、1個めのデータが0になるようにオフセットする
  if (header[0] == 'time') {
    const timeOffset = Number(unordered_data[0][0]);
    for (let i = 0; i < unordered_data.length; i++) {
      unordered_data[i][0] = String((Number(unordered_data[i][0]) - timeOffset) / 1000);
    }
  }

  // unordered_data の縦横を反転する
  data = [];
  for (let i = 0; i < header.length; i++) {
    data.push([]);
  }
  for (let i = 0; i < unordered_data.length; i++) {
    for (let j = 0; j < header.length; j++) {
      data[j].push(unordered_data[i][j]);
    }
  }

  console.log(header);
  console.log(data);
}

const getColumnIndexFromHeader = (column: string): number => {
  return header.indexOf(column);
}

/////////////////////
// Graph Functions //
/////////////////////
const updateGraph = () => {
  const graphWhole = document.getElementById("graph_whole");
  if (!graphWhole) return;
  graphWhole.innerHTML = '';

  // 目標速度・角速度と現在速度・角速度
  const graphEl = document.createElement("div");
  graphEl.className = 'graph-body';
  graphWhole.appendChild(graphEl);
  {
    const trace1: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('targetVT')],
      mode: 'lines',
      type: 'scatter',
      line: {
        dash: 'dot',
        width: 2,
      },
      name: 'Target Velocity Translation',
    };
    const trace2: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('currentVT')],
      mode: 'lines',
      type: 'scatter',
      name: 'Current Velocity Translation',
    };
    const trace3: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('targetVR')],
      mode: 'lines',
      type: 'scatter',
      line: {
        dash: 'dot',
        width: 2,
      },
      name: 'Target Velocity Rotation',
      yaxis: 'y2',
    };
    const trace4: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('currentVR')],
      mode: 'lines',
      type: 'scatter',
      name: 'Current Velocity Rotation',
      yaxis: 'y2',
    };
    const layout: Partial<Plotly.Layout> = {
      title: {
        text: '1. 目標速度と現在速度',
        x: 0.02,
      },
      margin: {
        b: 30,
        l: 50,
        t: 40,
        r: 50,
      },
      legend: {
        x: 0.02,
        y: 0.98,
      },
      height: 600,
      xaxis: {
        title: 'Time [ms]',
      },
      yaxis: {
        title: 'Velocity [mm/s]',
      },
      yaxis2: {
        title: 'Velocity [rad/s]',
        overlaying: 'y',
        side: 'right',
      }
    };
    Plotly.newPlot(graphEl, [trace1, trace2, trace3, trace4], layout);
  }

  // 左右モーターと目標速度・現在速度
  const graphEl2 = document.createElement("div");
  graphEl2.className = 'graph-body';
  graphWhole.appendChild(graphEl2);
  {
    const trace1: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('motorL')],
      mode: 'lines',
      type: 'scatter',
      name: 'Motor L',
    };
    const trace2: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('motorR')],
      mode: 'lines',
      type: 'scatter',
      name: 'Motor R',
    };
    const trace3: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('targetVT')],
      mode: 'lines',
      type: 'scatter',
      line: {
        dash: 'dot',
        width: 2,
      },
      name: 'Target Velocity Translation',
      yaxis: 'y2',
    };
    const trace4: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('currentVT')],
      mode: 'lines',
      type: 'scatter',
      name: 'Current Velocity Translation',
      yaxis: 'y2',
    };
    const layout: Partial<Plotly.Layout> = {
      title: {
        text: '2. 左右モーターと目標速度・現在速度',
        x: 0.02,
      },
      margin: {
        b: 30,
        l: 50,
        t: 40,
        r: 50,
      },
      legend: {
        x: 0.02,
        y: 0.98,
      },
      height: 600,
      xaxis: {
        title: 'Time [ms]',
      },
      yaxis: {
        title: 'Motor Duty',
      },
      yaxis2: {
        title: 'Velocity [mm/s]',
        overlaying: 'y',
        side: 'right',
      }
    };
    Plotly.newPlot(graphEl2, [trace1, trace2, trace3, trace4], layout);
  }

  // 各加速度と目標速度と現在速度
  const graphEl3 = document.createElement("div");
  graphEl3.className = 'graph-body';
  graphWhole.appendChild(graphEl3);
  {
    const trace1: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('accX')],
      mode: 'lines',
      type: 'scatter',
      name: 'Acc X',
    };
    const trace2: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('accY')],
      mode: 'lines',
      type: 'scatter',
      name: 'Acc Y',
    };
    const trace3: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('accZ')],
      mode: 'lines',
      type: 'scatter',
      name: 'Acc Z',
    };
    const trace4: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('targetVT')],
      mode: 'lines',
      type: 'scatter',
      line: {
        dash: 'dot',
        width: 2,
      },
      name: 'Target Velocity Translation',
      yaxis: 'y2',
    };
    const trace5: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('currentVT')],
      mode: 'lines',
      type: 'scatter',
      name: 'Current Velocity Translation',
      yaxis: 'y2',
    };
    const layout: Partial<Plotly.Layout> = {
      title: {
        text: '3. 各加速度と目標速度・現在速度',
        x: 0.02,
      },
      margin: {
        b: 30,
        l: 50,
        t: 40,
        r: 50,
      },
      legend: {
        x: 0.02,
        y: 0.98,
      },
      height: 600,
      xaxis: {
        title: 'Time [ms]',
      },
      yaxis: {
        title: 'Acceleration [m/s^2]',
      },
      yaxis2: {
        title: 'Velocity [mm]',
        overlaying: 'y',
        side: 'right',
      }
    };
    Plotly.newPlot(graphEl3, [trace1, trace2, trace3, trace4, trace5], layout);
  }

  // 壁センサと壁切れ
  const graphEl4 = document.createElement("div");
  graphEl4.className = 'graph-body';
  graphWhole.appendChild(graphEl4);
  {
    const trace1: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallFL')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Front Left',
    };
    const trace2: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallL')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Left',
    };
    const trace3: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallC')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Center',
    };
    const trace4: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallR')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Right',
    };
    const trace5: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallFR')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Front Right',
    };
    const trace6: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('kabekireL')],
      mode: 'lines',
      type: 'scatter',
      name: 'Kabekire L',
      yaxis: 'y2',
    };
    const trace7: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('kabekireR')],
      mode: 'lines',
      type: 'scatter',
      name: 'Kabekire R',
      yaxis: 'y2',
    };
    const layout: Partial<Plotly.Layout> = {
      title: {
        text: '4. 壁センサと壁切れ',
        x: 0.02,
      },
      margin: {
        b: 30,
        l: 50,
        t: 40,
        r: 50,
      },
      legend: {
        x: 0.02,
        y: 0.98,
      },
      height: 600,
      xaxis: {
        title: 'Time [ms]',
      },
      yaxis: {
        title: 'Wall Sensor Value',
        autorangeoptions: {
          minallowed: 0,
        },
      },
      yaxis2: {
        title: 'Kabekire',
        overlaying: 'y',
        side: 'right',
        range: [-1, 1.5],
      }
    };
    Plotly.newPlot(graphEl4, [trace1, trace2, trace3, trace4, trace5, trace6, trace7], layout);
  }

  // 壁センサと壁センサから計算した値
  const graphEl5 = document.createElement("div");
  graphEl5.className = 'graph-body';
  graphWhole.appendChild(graphEl5);
  {
    const trace1: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallFL')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Front Left',
    };
    const trace2: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallL')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Left',
    };
    const trace3: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallC')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Center',
    };
    const trace4: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallR')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Right',
    };
    const trace5: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallFR')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Front Right',
    };
    const trace6: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('distC')],
      mode: 'lines',
      type: 'scatter',
      name: 'Distance From Center Wall',
      yaxis: 'y2',
    };
    const layout: Partial<Plotly.Layout> = {
      title: {
        text: '5-1. 壁センサと計算値1',
        x: 0.02,
      },
      margin: {
        b: 30,
        l: 50,
        t: 40,
        r: 50,
      },
      legend: {
        x: 0.02,
        y: 0.98,
        bgcolor: 'rgba(255, 255, 255, 0.5)',
      },
      height: 600,
      xaxis: {
        title: 'Time [ms]',
      },
      yaxis: {
        title: 'Wall Sensor Value',
        autorangeoptions: {
          minallowed: 0,
        },
      },
      yaxis2: {
        title: 'Calculated value',
        overlaying: 'y',
        side: 'right',
      }
    };
    Plotly.newPlot(graphEl5, [trace1, trace2, trace3, trace4, trace5, trace6], layout);
  }
  const graphEl5_2 = document.createElement("div");
  graphEl5_2.className = 'graph-body';
  graphWhole.appendChild(graphEl5_2);
  {
    const trace1: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallFL')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Front Left',
    };
    const trace2: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallL')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Left',
    };
    const trace3: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallC')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Center',
    };
    const trace4: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallR')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Right',
    };
    const trace5: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('wallFR')],
      mode: 'lines',
      type: 'scatter',
      name: 'Wall Front Right',
    };
    const trace6: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('distF')],
      mode: 'lines',
      type: 'scatter',
      name: 'Distance From Front Wall',
      yaxis: 'y2',
    };
    const trace7: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('time')],
      y: data[getColumnIndexFromHeader('angF')],
      mode: 'lines',
      type: 'scatter',
      name: 'Angle From Front Wall',
      yaxis: 'y2',
    };
    const layout: Partial<Plotly.Layout> = {
      title: {
        text: '5-2. 壁センサと計算値2',
        x: 0.02,
      },
      margin: {
        b: 30,
        l: 50,
        t: 40,
        r: 50,
      },
      legend: {
        x: 0.02,
        y: 0.98,
        bgcolor: 'rgba(255, 255, 255, 0.5)',
      },
      height: 600,
      xaxis: {
        title: 'Time [ms]',
      },
      yaxis: {
        title: 'Wall Sensor Value',
        autorangeoptions: {
          minallowed: 0,
        },
      },
      yaxis2: {
        title: 'Calculated value',
        overlaying: 'y',
        side: 'right',
      }
    };
    Plotly.newPlot(graphEl5_2, [trace1, trace2, trace3, trace4, trace5, trace6, trace7], layout);
  }

  // X、Y、angle のプロット
  const graphEl6 = document.createElement("div");
  graphEl6.className = 'graph-body';
  graphWhole.appendChild(graphEl6);
  {
    const trace1: Partial<Plotly.ScatterData> = {
      x: data[getColumnIndexFromHeader('posX')],
      y: data[getColumnIndexFromHeader('posY')],
      mode: 'lines',
      type: 'scatter',
      name: 'Position',
    };
    const layout: Partial<Plotly.Layout> = {
      title: {
        text: '6. (X,Y) Plot',
        x: 0.02,
      },
      margin: {
        b: 30,
        l: 50,
        t: 40,
        r: 50,
      },
      legend: {
        x: 0.02,
        y: 0.98,
      },
      height: 1000,
      width: 1000,
      xaxis: {
        title: 'X [mm]',
        range: [0, 2880],
        tick0: 0,
        dtick: 360,
        gridwidth: 1,
        gridcolor: 'rgba(0,0,0,0.3)',
        minor: {
          dtick: 90,
          showgrid: true,
          gridwidth: 1,
          gridcolor: 'rgba(0,0,0,0.1)',
        }
      },
      yaxis: {
        title: 'Y [mm]',
        range: [0, 2880],
        tick0: 0,
        dtick: 360,
        gridwidth: 1,
        gridcolor: 'rgba(0,0,0,0.3)',
        minor: {
          dtick: 90,
          showgrid: true,
          gridwidth: 1,
          gridcolor: 'rgba(0,0,0,0.1)',
        }
      },
    };
    Plotly.newPlot(graphEl6, [trace1], layout);
  }
};

//////////////////
// HTML Control //
//////////////////
const setUartConnected = (connected: boolean) => {
  const buttonOpen = document.getElementById("button_open_port") as HTMLButtonElement;
  const buttonClose = document.getElementById("button_close_port") as HTMLButtonElement;
  const buttonReload = document.getElementById("button_reload_port") as HTMLButtonElement;
  const drawerPort = document.getElementById("select_port") as HTMLSelectElement;
  buttonOpen.disabled = connected;
  buttonClose.disabled = !connected;
  buttonReload.disabled = connected;
  drawerPort.disabled = connected;
}

////////////////
// HTML Event //
////////////////
const onUartOpenButtonClicked = async () => {
  const selectEl = document.getElementById("select_port") as HTMLSelectElement;
  const portName = selectEl.value;
  if (!portName) return;

  const result: boolean = await invoke("open_uart", {
    name: portName,
  });
  if (result) {
    setUartConnected(true);
    console.log('Port opened: ', portName);
  } else {
    console.log('Failed to open port: ', portName);
  }
};

const onUartCloseButtonClicked = async () => {
  const result: boolean = await invoke("close_uart", {});
  if (result) {
    setUartConnected(false);
    console.log('Port closed.');
  } else {
    console.log('Failed to close port.');
  }
};

const onUartReloadButtonClicked = () => {
  SerialPort.available_ports().then((ports) => {
    console.log('Available ports:', ports);
    uartPorts = ports;

    const selectEl = document.getElementById("select_port");
    if (selectEl) {
      selectEl.innerHTML = '';
      for (const [key, _] of Object.entries(uartPorts)) {
        const optionEl = document.createElement("option");
        optionEl.value = key;
        optionEl.text = key;
        selectEl.appendChild(optionEl);
      }
    }
  });
};

const onOpenCsvFileButtonClicked = async () => {
  const file = await open({
    multiple: false,
    directory: false,
  });
  console.log('Selected file:', file);

  if (file) {
    const newfilepath = convertFileSrc(file);
    const response = await fetch(newfilepath);
    const text = await response.text();
    const lines = text.split('\n');

    // TODO: /^time,/ or /[DEBUG]\n$/ or /\+(---\+){32} を満たす行を探す
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('time,')) {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex == -1) {
      console.log('This file does not contain header line.');
      return;
    }

    header = lines[headerIndex].split(',');
    let unordered_data = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].split(',');
      if (line.length === header.length) {
        unordered_data.push(line);
      } else {
        console.log(`Line ${i} is invalid.`);
      }
    }

    // header[0] == 'time' の場合、time を [us] から [ms] に変換し、1個めのデータが0になるようにオフセットする
    if (header[0] == 'time') {
      const timeOffset = Number(unordered_data[0][0]);
      for (let i = 0; i < unordered_data.length; i++) {
        unordered_data[i][0] = String((Number(unordered_data[i][0]) - timeOffset) / 1000);
      }
    }

    // unordered_data の縦横を反転する
    data = [];
    for (let i = 0; i < header.length; i++) {
      data.push([]);
    }
    for (let i = 0; i < unordered_data.length; i++) {
      for (let j = 0; j < header.length; j++) {
        data[j].push(unordered_data[i][j]);
      }
    }

    console.log(header);
    console.log(data);

    updateGraph();
  }
};

const onSaveFileButtonClicked = async () => {
  const file = await save({
    filters: [{
      name: 'CSV File',
      extensions: ['csv'],
    }]
  });
  console.log('Selected filepath:', file);

  if (file) {
    try {
      await writeTextFile(file, currentData);
      console.log('Saved file:', file);
    } catch (e) {
      console.error('Failed to save file:', file);
    }
  }
}

///////////////////////
// DOMContenttLoaded //
///////////////////////
window.addEventListener("DOMContentLoaded", () => {
  setUartConnected(false);

  listen('logdata', (event) => {
    const payload = event.payload as string;
    currentData = payload;
    console.log('Received data:', currentData);
    parseStringData(currentData);
    updateGraph();
  });
});

/////////////////////
// Startup routine //
/////////////////////

// List available ports
onUartReloadButtonClicked();

// Set event listener
document.getElementById("button_open_file")?.addEventListener("click", onOpenCsvFileButtonClicked);
document.getElementById("button_open_port")?.addEventListener("click", onUartOpenButtonClicked);
document.getElementById("button_close_port")?.addEventListener("click", onUartCloseButtonClicked);
document.getElementById("button_reload_port")?.addEventListener("click", onUartReloadButtonClicked);
document.getElementById("button_save_file")?.addEventListener("click", onSaveFileButtonClicked);
