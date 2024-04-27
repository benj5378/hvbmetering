// import Image from 'next/image'
// import styles from './page.module.css'

"use client";

import "bootstrap/dist/css/bootstrap.css"
import { Chart, registerables } from "chart.js"

import { useEffect, useState, useRef } from "react"
const { DateTime, Duration } = require("luxon");

export default function Home() {
    return (
        // <main className={styles.main}>
        // </main>    
        <div className="container">
            <LiveMeters />
            <Announcements />
            <MeterLineChart />
        </div>
    )
}

function Announcements() {
    const [announcements, setAnnouncements] = useState([]);


    async function getData() {
        let response = await fetch("./announcements.json", {
            method: "GET"
        });
        let json = await response.json()
        setAnnouncements(json);
    };

    useEffect(() => {
        getData();
    }, []);

    return <div className="mt-2">
        {announcements.map((announcement, index) => {
            return <div className="alert alert-primary" role="alert" key={index}>
                {announcement}
            </div>
        })}
    </div> 
}

function LiveMeters() {
    const [data, setData] = useState([]);

    function getData() {
        fetch("https://bug-pleasant-briefly.ngrok-free.app", {headers: {"ngrok-skip-browser-warning": "62940"}})
            .then((res) => res.text())
            .then((text) => {
                let pos = text.lastIndexOf(",");
                return text.slice(0, pos) + text.slice(pos + 1, text.length);
            })
            .then((jsonString) => {
                setData(JSON.parse(jsonString));
            });
    }

    useEffect(() => {
        const interval = setInterval(() => {
            getData();
        }, 2300);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="row mt-4">
            <div className="col-12 col-sm-6">
                <LiveMeter data={data} meter={5} title="vognhal" />
            </div>
            <div className="col-12 col-sm-6">
                <LiveMeter data={data} meter={6} title="kiosk" />
            </div>
        </div>
    )
}

function MeterLineChart() {
    const [toDate, setToDate] = useState((new Date()).toISOString().split("T")[0]);
    const [fromDate, setFromDate] = useState(DateTime.now().minus({days: 6}).toISODate());
    const chartSetUp = useRef(false);

    const [viewType, setViewType] = useState("averaged");

    const [json, setJson] = useState([])

    async function getData() {
        const response = await fetch("https://forbrug.ibk.dk/senders/electricity.php", {
            method: "POST",
            body: JSON.stringify({
                "start": fromDate,
                "end": toDate,
            }),
        });
        let responseJson = await response.json();

        // Index dates in json for efficiency
        for(let entry of responseJson) {
            entry["start"] = DateTime.fromSQL(entry["start"]);
            entry["end"] = DateTime.fromSQL(entry["end"]);
        }
        // Much fastern now than parsing every time, especially during filtering

        setJson(responseJson);
    }

    useEffect(() => {
        getData();
    }, [fromDate, toDate]);

    useEffect(() => {
        if(json.length == 0) {
            return;
        }
        updateChart2();
    }, [json, viewType]);

    function updateChart2() {

        if (chartCreated.current == null) {
            return;
        }

        // Get unique dates
        let dates = [];
        for(let i = 0; i < json.length; i++) {
            let date = json[i]["end"]
            if (dates.includes(date)) continue;
            dates.push(date);
        }
        dates.sort()

        // Get all dates between range
        let current = dates[0];
        let end = dates[dates.length - 1];
        let labels = [current.setLocale("sv").toLocaleString(DateTime.DATETIME_MED)];  // First current is first date
        let dates2 = [current]
        let interval = {};
        const diffDays = end.diff(current, "days").as("days")
        console.log(diffDays)
        if (diffDays < 2) {
            interval = { minutes: 15 };
        }
        else if (diffDays < 5) {
            interval = { hour: 1 };
        }
        else if (diffDays < 7) {
            interval = { hour: 3 };
        }
        else if (diffDays < 10) {
            interval = { hour: 4 };
        }
        else if (diffDays < 25) {
            interval = { hour: 6 };
        }
        else {
            interval = { days: 1 };
        }

        while(current < end) {
            current = current.plus(interval);
            dates2.push(current);
            labels.push(current.setLocale("sv").toLocaleString(DateTime.DATETIME_MED))
        }

        // Get kWh
        let values = {"5": [], "6": []};
        for(let meter in values) {
            let previousDate = DateTime.fromSQL("2000-00-00 00:00:00");
            let previouskwh = 0;
            for(let date of dates2) {
                let elements = json.filter(element => (
                    element["meter"] == meter
                    && element["end"] > previousDate
                    && element["end"] <= date
                ));
                previousDate = date;
                if (elements === undefined) {
                    values[meter].push(0);
                    continue;
                }
                let kWh = accumulateElements(elements);
                if (viewType == "averaged" || viewType == "log averaged") {
                    let time = accumulateElementsTime(elements);
                    values[meter].push(kWh * 1000 / time.as("hours"));
                }
                else {
                    // Avoid points at missing data. To do: convert chart to scatter plot
                    if (elements.length == 0) {
                        values[meter].push(NaN);
                        continue;
                    }
                    values[meter].push(previouskwh + kWh);
                    previouskwh = previouskwh + kWh;
                }
            }
        }

        chartCreated.current.data.labels = labels;
        chartCreated.current.data.datasets = [
            {
                label: "Vognhal",
                data: values["5"],
                borderWidth: 1,
            },
            {
                label: "Kiosk",
                data: values["6"],
                borderWidth: 1,
            },
        ];
        
        let yType = "linear"
        let yLegend = "watts"
        if (viewType == "accumulated") {
            yLegend = "accumulated kilowatt-hours"
        }
        else if (viewType == "log averaged") {
            yType = "logarithmic";
        }
        chartCreated.current.options.scales.y.title.text = yLegend;
        chartCreated.current.options.scales.y.type = yType;

        chartCreated.current.update();
    }

    let chartCreated = useRef(null);

    useEffect(() => {
        if (!chartCreated.current) {
            const ctx = document.getElementById("chart");
            Chart.register(...registerables);
            chartCreated.current = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Vognhal',
                        data: [],
                        borderWidth: 1
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: "Watts"
                            },
                            type: "linear"
                        }
                    }
                }
            });
        }
    });

    return (
        <div className="mt-4">
            <div style={{height: "400px"}}>
                <canvas id="chart"></canvas>
            </div>
            <div className="row mt-2">
                <div className="col-md">
                    <div className="form-floating">
                        <input id="fromDate" className="form-control" type="date" value={fromDate} onChange={date => setFromDate(date.target.value)} />
                        <label htmlFor="fromDate">From date</label>
                    </div>
                </div>
                <div className="col-md">
                    <div className="form-floating">
                        <input id="toDate" className="form-control" type="date" value={toDate} onChange={date => setToDate(date.target.value)} />
                        <label htmlFor="toDate">To date</label>
                    </div>
                </div>
            </div>
            <div className="btn-group mt-3" role="group" aria-label="Basic radio toggle button group">
                <input type="radio" className="btn-check" name="btnradio" id="btnradio1" autoComplete="off" checked={viewType == "averaged"} onChange={() => setViewType("averaged")} />
                <label className="btn btn-outline-primary" htmlFor="btnradio1">Average</label>
                
                <input type="radio" className="btn-check" name="btnradio" id="btnradio2" autoComplete="off" checked={viewType == "log averaged"} onChange={() => {setViewType("log averaged"); console.log("here")}} />
                <label className="btn btn-outline-primary" htmlFor="btnradio2">log(average)</label>

                <input type="radio" className="btn-check" name="btnradio" id="btnradio3" autoComplete="off" checked={viewType == "accumulated"} onChange={() => setViewType("accumulated")} />
                <label className="btn btn-outline-primary" htmlFor="btnradio3">Accumulate</label>
            </div>
            <div className="row mt-2">
                <div className="">
                    {/*<button className="btn btn-primary" onClick={updateChart()}>Update</button>*/}
                </div>
            </div>
        </div>
    )
}


function LiveMeter({data, meter, title}) {
    let myData = function (data, meter){
        return data.find(
            function(entry) {
                return entry["meter"] == meter;
            }
        )
    }(data, meter);

    let wattage = "loading..."
    if (myData !== undefined) {
        wattage = Math.round(myData["kW"] * 1000);
    }


    function linearConvert(value, max) {
        const result = value / max;
        if (result > max) {
            return 1;
        }
        return result;
    }

    let seriousness = `rgb(${linearConvert(wattage, 3000) * 255}, ${(linearConvert(wattage, 3000) * -1 + 1) * 255}, 0)`;

    return (
        <div>
            <span style={{borderLeft: "calc(40px * 0.3) solid transparent", paddingLeft: "10px"}}>{title}</span><br />
            <span style={{borderLeft: `0.3em solid ${seriousness}`, fontSize: "40px", paddingLeft: "10px"}}>
                {wattage} watts
            </span>
        </div>
    );
}






// For handling meter data
//
//


function accumulateElements(elements) {
    let accumulated = 0;
    for (let element of elements) {
        if (parseFloat(element["kwh"]) == 0) {
            console.log("fuck")
        }
        accumulated += parseFloat(element["kwh"]);
    }
    return accumulated;
}

function averageElements(elements) {
    return accumulateElements(elements) / elements.length;
}

function accumulateElementsTime(elements) {
    let accumulated = Duration.fromMillis(0);
    for (let element of elements) {
        let start = element["start"];
        let end = element["end"];
        accumulated = accumulated.plus(end.diff(start));
    }
    return accumulated;
}
