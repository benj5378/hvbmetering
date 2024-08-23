"use client";

import Image from 'next/image'
// import styles from './page.module.css'

import { headers } from "@/next.config";
import "bootstrap/dist/css/bootstrap.css"
import { Chart, registerables } from "chart.js"

import { useEffect, useState, useRef, useId } from "react"
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
    const [config, setConfig] = useState([]);

    async function getConfig() {
        let response = await fetch("./config.json", {
            method: "GET"
        });
        let json = await response.json();
        await setConfig(json)
    }

    async function getData() {
        // const opts = {
        //     headers: {
        //         // "ngrok-skip-browser-warning": "62940"
        //     }
        // }
        for(const meter of config) {
            if("url" in meter) {
                fetch(meter["url"])
                .then((res) => res.text())
                .then((jsonString) => {
                    setData((old) => updateOrAdd(old, JSON.parse(jsonString)))
                });
            }
        }
    }

    useEffect(() => {
        getConfig();
        const interval = setInterval(() => {
            getData();
        }, 900);
        return () => clearInterval(interval);
    }, [config, data]);

    return (
        <div className="row mt-4">
            {
                config.map(function (element) {
                    return (
                        <div className="col-md" key={"meter" + element["meter"]}>
                            <LiveMeter data={data} meter={element["meter"]} title={element["name"]} />
                        </div>
                    )
                })
            }
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
        else if (diffDays < 2) {
            interval = { minutes: 30 };
        }
        else if (diffDays < 5) {
            interval = { hour: 1 };
        }
        else if (diffDays < 8) {
            interval = { hour: 1, minutes: 30 };
        }
        else if (diffDays < 12) {
            interval = { hour: 2 };
        }
        else if (diffDays < 20) {
            interval = { hour: 3 };
        }
        else if (diffDays < 40) {
            interval = { hour: 6 };
        }
        else {
            interval = { day: 1 };
        }

        while(current < end) {
            current = current.plus(interval);
            dates2.push(current);
            labels.push(current.setLocale("sv").toLocaleString(DateTime.DATETIME_MED))
        }

        // Get kWh
        let values = {"1": [], "2": [], "3": [], "4": [], "5": [], "6": []};
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

        chartCreated.current.data.datasets = chartCreated.current.data.datasets.map((dataset, i) => {
            console.log(dataset)
            console.log(chartCreated.current.isDatasetVisible(i))
                                                          // Will return false as no sets has been given yet.
                                                          // Therefore, only use isDatasetVisible af first set up
            return {...dataset, hidden: !chartCreated.current.isDatasetVisible(i)};
        })

        chartCreated.current.data.labels = labels;
        let nextDataset = [
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
            {
                label: "Hedelands Veteranbane",
                data: values["3"],
                borderWidth: 1,
            },
            {
                label: "Stald/ridehal?",
                data: values["1"],
                borderWidth: 1,
            },
            {
                label: "Snedkerværksted/rytterstue??",
                data: values["2"],
                borderWidth: 1,
            },
            {
                label: "Høje-Taastrup Kommune",
                data: values["4"],
                borderWidth: 1,
            },
        ];
        
        let prehiddenDatasets = ["Stald/ridehal?", "Snedkerværksted/rytterstue??", "Høje-Taastrup Kommune"];
        chartCreated.current.data.datasets = nextDataset.map((dataset, i) => {
            if(!chartSetUp.current && prehiddenDatasets.includes(dataset.label)) {
                return {...dataset, hidden: true}
            }
            if(!chartSetUp.current) {
                return dataset;
            }
            console.log(chartCreated.current.isDatasetVisible(i))
                                                           // Will return false as no sets has been given yet.
                                                                  // Therefore, only use isDatasetVisible af first set up
            return {...dataset, hidden: !chartCreated.current.isDatasetVisible(i)};
        })

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

        chartSetUp.current = true;
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
                
                <input type="radio" className="btn-check" name="btnradio" id="btnradio2" autoComplete="off" checked={viewType == "log averaged"} onChange={() => setViewType("log averaged")} />
                <label className="btn btn-outline-primary" htmlFor="btnradio2">log(average)</label>

                <input type="radio" className="btn-check" name="btnradio" id="btnradio3" autoComplete="off" checked={viewType == "accumulated"} onChange={() => setViewType("accumulated")} />
                <label className="btn btn-outline-primary" htmlFor="btnradio3">Accumulate</label>
            </div>
            <div className="row mt-2">
                <div className="">
                    {/*<button className="btn btn-primary" onClick={updateChart()}>Update</button>*/}
                </div>
            </div>
            <div className="row mt-3">
                <h2>Analysis of chosen period</h2>
                <Analysis className="col-md" json={json} meter={5} name="Vognhal" />
                <Analysis className="col-md" json={json} meter={6} name="Kiosk" />
                <Analysis className="col-md" json={json} meter={3} name="Hedelands Veteranbane" />
            </div>
        </div>
    )
}

function Analysis({className, json, meter, name}) {
    const chartCreated = useRef()
    const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const chartId = useId();

    useEffect(() => {
        if(chartCreated.current == null) {
            console.log("SETUP");
            const ctx = document.getElementById(chartId);
            console.log(ctx);
            Chart.register(...registerables);
            chartCreated.current = "asd"
            chartCreated.current = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: weekdays,
                    datasets: [
                        {
                            data: [0.1, 0.2],
                        }
                    ]
                },
                options: {
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: name
                        },
                        subtitle: {
                            display: true,
                            text: "kilowatt-hours"
                        }
                    }
                }
            });
        }
    }, []);

    useEffect(() => {
        if(json.length == 0) {
            return;
        }

        let values = []
        for(let i = 1; i <= weekdays.length; i++) {
            let filtered = json.filter((element) => (
                element["meter"] == meter &&
                element["start"].weekday == i
            ));
            let kwh = accumulateElements(filtered);
            values.push(kwh)
        }
        console.log(values)
        chartCreated.current.data.datasets[0].data = values;
        chartCreated.current.update();
    }, [json])

    return (
        <div className={className} style={{height: "400px"}}>
            <canvas id={chartId}></canvas>
        </div>
    );
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
            {
                wattage > 4000 && <img src="5Mz4.gif" style={{height: "160px", position: "absolute", transform: "translate(20px, -75px)"}} />
            }
        </div>
    );
}






// For handling meter data
//
//


function accumulateElements(elements) {
    let accumulated = 0;
    for (let element of elements) {
        // Why are there cases where kwh can be 0? If no power has been used?
        // if (parseFloat(element["kwh"]) == 0) {
        //     console.log("fuck")
        //     console.log(element)
        // }
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
