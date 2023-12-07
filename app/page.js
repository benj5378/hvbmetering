// import Image from 'next/image'
// import styles from './page.module.css'

"use client";

import "bootstrap/dist/css/bootstrap.css"
import { Chart, registerables } from "chart.js"

import { useEffect, useState, useRef } from "react"

export default function Home() {

    const [toDate, setToDate] = useState(() => {
        let d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split("T")[0];
    });
    const [fromDate, setFromDate] = useState((new Date()).toISOString().split("T")[0]);

    const chartSetUp = useRef(false);

    constructor

    useEffect(() => {
        if (chartSetUp.current == false) {
            Chart.register(...registerables);
            chartSetUp.current = true;
            const ctx = document.getElementById("chart");
    
            new Chart(ctx, {
              type: 'bar',
              data: {
                labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
                datasets: [{
                  label: '# of Votes',
                  data: [12, 19, 3, 5, 2, 3],
                  borderWidth: 1
                }]
              },
              options: {
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }
            });
        }

    }, [chartSetUp])

    return (
        // <main className={styles.main}>
        // </main>

        <div className="container">
            <div>
                <canvas id="chart"></canvas>
            </div>
            <div className="row">
                <div className="col-md">
                    <div className="form-floating">
                        <input id="fromDate" className="form-control" type="date" value={fromDate} onChange={date => setFromDate(date.target.value)} />
                        <label htmlFor="fromDate">From date</label>
                    </div>
                </div>
                <div className="col-md">
                    <div className="form-floating">
                        <input id="toDate" className="form-control" type="date" value={toDate} onChange={date => console.log(date.target.value)} />
                        <label htmlFor="toDate">To date</label>
                    </div>
                </div>
            </div>
            <div className="row">
                <div className="">
                    <button className="btn btn-primary">Update</button>
                </div>
            </div>
        </div>
    )
}
